const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const { imageSize } = require('image-size');

const env = require('../config/env');
const { httpError } = require('../utils/errors');

/**
 * Local media storage backed by a persistent volume (a Railway volume in
 * production, a gitignored directory in development).
 *
 * Layout under `env.storage.root`:
 *
 *   media/<environment>/<media type>/<yyyy>/<mm>/<uuid>.<ext>   served at /uploads/...
 *   tmp/<random>                                                in-flight uploads only
 *
 * `tmp/` deliberately sits outside the directory that is served over HTTP, so
 * a partially written or rejected upload is never reachable by URL. Both
 * directories live on the same filesystem, which makes the final move a
 * rename: a reader can never observe a half-written file at its public path.
 */

const MEDIA_LIMITS = {
  image: 5 * 1024 * 1024,
  video: 100 * 1024 * 1024,
  document: 10 * 1024 * 1024,
};

const ALLOWED_FORMATS = {
  image: ['jpg', 'jpeg', 'png', 'webp'],
  video: ['mp4', 'webm'],
  document: ['pdf'],
};

const STORAGE_PROVIDER = 'local';
const PUBLIC_PREFIX = '/uploads';

// Canonical file extension and MIME type per detected format. `jpeg` is
// normalised to `jpg` so the same image never lands under two extensions.
const FORMAT_DETAILS = {
  jpg: { extension: 'jpg', mimeType: 'image/jpeg', mediaType: 'image' },
  png: { extension: 'png', mimeType: 'image/png', mediaType: 'image' },
  webp: { extension: 'webp', mimeType: 'image/webp', mediaType: 'image' },
  mp4: { extension: 'mp4', mimeType: 'video/mp4', mediaType: 'video' },
  webm: { extension: 'webm', mimeType: 'video/webm', mediaType: 'video' },
  pdf: { extension: 'pdf', mimeType: 'application/pdf', mediaType: 'document' },
};

// Enough bytes to cover every signature checked below, including the ISO-BMFF
// `ftyp` box that identifies MP4 and the RIFF/WEBP pair.
const SNIFF_BYTES = 4096;

function startsWith(buffer, bytes, offset = 0) {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

/**
 * Identifies a file from its leading bytes. The browser-supplied MIME type is
 * never trusted: a `.jpg` name or an `image/png` Content-Type says nothing
 * about the bytes that actually arrived.
 */
function sniffFormat(buffer) {
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'jpg';
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';

  // RIFF....WEBP
  if (
    startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'webp';
  }

  // Matroska/WebM EBML header.
  if (startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3])) return 'webm';

  // ISO base media file format: a size field followed by the "ftyp" box type.
  if (startsWith(buffer, [0x66, 0x74, 0x79, 0x70], 4)) return 'mp4';

  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf';

  return null;
}

function environmentSegment() {
  if (env.isTest) return 'test';
  return env.isProduction ? 'prod' : 'dev';
}

function mediaRoot() {
  return env.storage.mediaDir;
}

function tmpRoot() {
  return env.storage.tmpDir;
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

/**
 * Resolves a stored key to an absolute path, refusing anything that escapes
 * the media directory. Keys come from the database, but a key is still data:
 * a row holding `../../etc/passwd` must not be able to reach outside.
 */
function resolveKey(key) {
  const root = mediaRoot();
  const resolved = path.resolve(root, key);
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;

  if (resolved !== root && !resolved.startsWith(prefix)) {
    throw httpError(400, 'INVALID_STORAGE_KEY', 'Invalid storage key');
  }

  return resolved;
}

function publicUrlFor(key) {
  return `${PUBLIC_PREFIX}/${key.split(path.sep).join('/')}`;
}

function buildKey(mediaType, extension) {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const name = `${crypto.randomUUID()}.${extension}`;

  return path.join(environmentSegment(), mediaType, year, month, name);
}

/** Creates an empty temporary file and returns its absolute path. */
async function createTempPath() {
  const dir = tmpRoot();
  await ensureDir(dir);
  return path.join(dir, `${crypto.randomUUID()}.part`);
}

async function removeQuietly(filePath) {
  if (!filePath) return;
  try {
    await fsp.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`[media] could not remove ${filePath}: ${error.message}`);
    }
  }
}

async function readHead(filePath) {
  const handle = await fsp.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(SNIFF_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, SNIFF_BYTES, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/**
 * Reads the pixel dimensions of an image. Videos are left without dimensions
 * or a duration: reading those needs ffprobe, which the deployment image does
 * not carry, and the schema allows both to be null.
 */
async function readImageDimensions(filePath) {
  try {
    const head = await fsp.readFile(filePath);
    const { width, height } = imageSize(head);
    return {
      width: Number.isFinite(width) ? width : null,
      height: Number.isFinite(height) ? height : null,
    };
  } catch {
    return { width: null, height: null };
  }
}

/**
 * Validates a finished temporary upload and moves it to its permanent path.
 *
 * Resolves to the metadata the `media` row needs. On any validation failure the
 * temporary file is removed and an HttpError is thrown, so a rejected upload
 * leaves nothing behind on the volume.
 */
async function commitUpload(mediaType, tempPath) {
  if (!ALLOWED_FORMATS[mediaType]) {
    await removeQuietly(tempPath);
    throw httpError(400, 'INVALID_MEDIA_TYPE', 'Invalid media type');
  }

  try {
    const stats = await fsp.stat(tempPath);
    const bytes = stats.size;

    if (bytes <= 0) {
      throw httpError(400, 'EMPTY_FILE', 'Uploaded file is empty');
    }

    if (bytes > MEDIA_LIMITS[mediaType]) {
      throw httpError(413, 'ASSET_TOO_LARGE', 'File exceeds maximum allowed size');
    }

    const format = sniffFormat(await readHead(tempPath));

    if (!format || !ALLOWED_FORMATS[mediaType].includes(format)) {
      throw httpError(
        400,
        'INVALID_ASSET_FORMAT',
        `Unsupported file contents for ${mediaType}`,
      );
    }

    const details = FORMAT_DETAILS[format];

    if (details.mediaType !== mediaType) {
      throw httpError(400, 'ASSET_TYPE_MISMATCH', 'File contents do not match the media type');
    }

    const dimensions =
      mediaType === 'image'
        ? await readImageDimensions(tempPath)
        : { width: null, height: null };

    const key = buildKey(mediaType, details.extension);
    const destination = resolveKey(key);

    await ensureDir(path.dirname(destination));
    await fsp.rename(tempPath, destination);
    await fsp.chmod(destination, 0o644);

    return {
      storageProvider: STORAGE_PROVIDER,
      storageKey: key.split(path.sep).join('/'),
      fileUrl: publicUrlFor(key),
      mimeType: details.mimeType,
      format,
      bytes,
      width: dimensions.width,
      height: dimensions.height,
      durationSeconds: null,
    };
  } catch (error) {
    await removeQuietly(tempPath);
    throw error;
  }
}

/** Writes a buffer through the same validation path as an HTTP upload. */
async function saveBuffer(mediaType, buffer) {
  const tempPath = await createTempPath();
  await fsp.writeFile(tempPath, buffer, { mode: 0o600 });
  return commitUpload(mediaType, tempPath);
}

/**
 * Deletes a stored object. A missing file is not an error: the database row is
 * the record of truth and must still be removable if the file already went.
 */
async function deleteByKey(key) {
  let target;

  try {
    target = resolveKey(key);
  } catch (error) {
    console.error(`[media] refusing to delete unsafe storage key "${key}"`);
    return;
  }

  await removeQuietly(target);
}

async function exists(key) {
  try {
    await fsp.access(resolveKey(key), fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Removes abandoned temporary files. multer unlinks its own temporary file when
 * a request aborts, but a hard process kill mid-upload can leave one behind.
 */
async function pruneTempFiles(maxAgeMs = 6 * 60 * 60 * 1000) {
  const dir = tmpRoot();
  let entries;

  try {
    entries = await fsp.readdir(dir);
  } catch {
    return 0;
  }

  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;

  for (const entry of entries) {
    const filePath = path.join(dir, entry);
    try {
      const stats = await fsp.stat(filePath);
      if (stats.isFile() && stats.mtimeMs < cutoff) {
        await fsp.unlink(filePath);
        removed += 1;
      }
    } catch {
      // Raced with another prune or an in-flight upload; nothing to do.
    }
  }

  return removed;
}

module.exports = {
  MEDIA_LIMITS,
  ALLOWED_FORMATS,
  FORMAT_DETAILS,
  STORAGE_PROVIDER,
  PUBLIC_PREFIX,
  mediaRoot,
  tmpRoot,
  sniffFormat,
  createTempPath,
  commitUpload,
  saveBuffer,
  deleteByKey,
  exists,
  publicUrlFor,
  pruneTempFiles,
  removeQuietly,
};
