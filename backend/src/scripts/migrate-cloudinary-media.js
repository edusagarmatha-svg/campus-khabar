#!/usr/bin/env node
/**
 * One-off migration: copy media that still lives with a remote provider onto
 * this deployment's storage volume, then repoint every reference at the local
 * copy.
 *
 * Usage (from backend/):
 *
 *   node src/scripts/migrate-cloudinary-media.js --dry-run   # report only
 *   node src/scripts/migrate-cloudinary-media.js             # perform it
 *
 * On Railway, run it against the deployed database and volume with:
 *
 *   railway run --service <service> node src/scripts/migrate-cloudinary-media.js
 *
 * What it does, in order:
 *
 *   1. Downloads each `media` row whose `storage_provider` is not `local`.
 *   2. Writes the bytes through the normal storage validation path, so a
 *      migrated file is held to the same format and size rules as a new upload.
 *   3. Updates the row to the local provider, key, relative URL, size and MIME
 *      type, preserving dimensions the provider recorded when the local reader
 *      cannot determine them (notably video, which has no dimensions here).
 *   4. Rewrites the absolute provider URLs embedded in `posts.content` and
 *      `post_revisions.content`, which store the editor document as JSON.
 *
 * The script is idempotent: rows already on local storage are skipped, and the
 * URL rewrite is a no-op once no old URL remains. A row whose download fails is
 * left exactly as it was and reported at the end, so the run can be repeated.
 *
 * `post_media` and `post_revision_media` only hold media ids, which do not
 * change, so they need no rewriting.
 */
const db = require('../db/knex');
const env = require('../config/env');
const storageService = require('../services/storageService');

const DRY_RUN = process.argv.includes('--dry-run');
const DOWNLOAD_TIMEOUT_MS = 120_000;
const CONTENT_BATCH_SIZE = 200;

function log(message) {
  console.log(`[media-migration] ${message}`);
}

async function download(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow' });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    return Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(timeout);
  }
}

async function migrateRow(row) {
  const buffer = await download(row.file_url);

  if (DRY_RUN) {
    return {
      fileUrl: '(dry run)',
      bytes: buffer.length,
      storageKey: '(dry run)',
    };
  }

  const stored = await storageService.saveBuffer(row.media_type, buffer);

  try {
    await db('media')
      .where({ id: row.id })
      .update({
        storage_provider: stored.storageProvider,
        storage_key: stored.storageKey,
        file_url: stored.fileUrl,
        mime_type: stored.mimeType,
        file_size: stored.bytes,
        // Keep what the previous provider measured when the local reader
        // cannot determine it, rather than discarding known dimensions.
        width: stored.width ?? row.width,
        height: stored.height ?? row.height,
      });
  } catch (error) {
    // Never leave a file on the volume that no row points at.
    await storageService.deleteByKey(stored.storageKey);
    throw error;
  }

  return stored;
}

/**
 * Replaces old media URLs inside the editor's JSON documents. The documents are
 * rewritten as text so that a URL appearing in any attribute — image `src`,
 * video `src`, a link `href` — is caught without having to walk every node
 * type the editor may produce.
 */
async function rewriteContent(table, urlMap) {
  if (urlMap.size === 0) return 0;

  let lastId = 0;
  let updated = 0;

  for (;;) {
    const rows = await db(table)
      .select('id', 'content')
      .where('id', '>', lastId)
      .orderBy('id', 'asc')
      .limit(CONTENT_BATCH_SIZE);

    if (rows.length === 0) break;

    for (const row of rows) {
      lastId = row.id;

      const original =
        typeof row.content === 'string' ? row.content : JSON.stringify(row.content);

      let rewritten = original;
      for (const [oldUrl, newUrl] of urlMap) {
        rewritten = rewritten.split(oldUrl).join(newUrl);
      }

      if (rewritten === original) continue;

      // Guard against a replacement that corrupts the document.
      JSON.parse(rewritten);

      updated += 1;

      if (!DRY_RUN) {
        await db(table).where({ id: row.id }).update({ content: rewritten });
      }
    }
  }

  return updated;
}

async function main() {
  log(`environment: ${env.nodeEnv}`);
  log(`database: ${env.db.database} on ${env.db.host}:${env.db.port}`);
  log(`storage volume: ${env.storage.root}`);
  if (DRY_RUN) log('DRY RUN: nothing will be written');

  const rows = await db('media')
    .whereNot({ storage_provider: storageService.STORAGE_PROVIDER })
    .orderBy('id', 'asc');

  if (rows.length === 0) {
    log('no remote media rows found; nothing to migrate');
    return { migrated: 0, failed: [], contentUpdates: 0 };
  }

  log(`found ${rows.length} media row(s) to migrate`);

  const urlMap = new Map();
  const failed = [];
  let migrated = 0;

  for (const row of rows) {
    try {
      const stored = await migrateRow(row);
      migrated += 1;

      if (!DRY_RUN && row.file_url && row.file_url !== stored.fileUrl) {
        urlMap.set(row.file_url, stored.fileUrl);
      }

      log(`#${row.id} ${row.media_type} ${row.file_url} -> ${stored.fileUrl} (${stored.bytes} bytes)`);
    } catch (error) {
      failed.push({ id: row.id, url: row.file_url, reason: error.message });
      console.error(`[media-migration] #${row.id} FAILED: ${error.message}`);
    }
  }

  const posts = await rewriteContent('posts', urlMap);
  const revisions = await rewriteContent('post_revisions', urlMap);
  log(`rewrote embedded URLs in ${posts} post(s) and ${revisions} revision(s)`);

  return { migrated, failed, contentUpdates: posts + revisions };
}

main()
  .then(({ migrated, failed }) => {
    log(`done: ${migrated} migrated, ${failed.length} failed`);

    if (failed.length > 0) {
      for (const failure of failed) {
        console.error(`[media-migration] unresolved: #${failure.id} ${failure.url} (${failure.reason})`);
      }
      log('re-run the script to retry the failures; migrated rows are skipped');
    }

    return db.destroy().then(() => process.exit(failed.length > 0 ? 1 : 0));
  })
  .catch(async (error) => {
    console.error(`[media-migration] aborted: ${error.message}`);
    await db.destroy().catch(() => {});
    process.exit(1);
  });
