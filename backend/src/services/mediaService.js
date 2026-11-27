const db = require('../db/knex');
const { httpError } = require('../utils/errors');
const storageService = require('./storageService');

function toPublicMedia(row) {
  if (!row) return null;
  return {
    id: row.id,
    media_type: row.media_type,
    source_type: row.source_type,
    storage_provider: row.storage_provider,
    storage_key: row.storage_key,
    file_url: row.file_url,
    file_name: row.file_name,
    mime_type: row.mime_type,
    file_size: row.file_size,
    alt_text: row.alt_text,
    width: row.width,
    height: row.height,
    duration_seconds: row.duration_seconds,
    uploaded_by: row.uploaded_by,
    created_at: row.created_at,
  };
}

function canManageMedia(user, media) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'editor' && Number(media.uploaded_by) === Number(user.id)) return true;
  return false;
}

async function getMediaById(id) {
  const mediaId = Number(id);
  if (!Number.isInteger(mediaId) || mediaId <= 0) {
    throw httpError(400, 'INVALID_MEDIA_ID', 'Invalid media id');
  }
  const row = await db('media').where({ id: mediaId }).first();
  if (!row) {
    throw httpError(404, 'MEDIA_NOT_FOUND', 'Media not found');
  }
  return toPublicMedia(row);
}

async function listMedia(user, filters = {}, pagination = {}) {
  const page = Math.max(1, Number(pagination.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(pagination.limit) || 20));
  const offset = (page - 1) * limit;

  let query = db('media');

  if (filters.media_type) query = query.where({ media_type: filters.media_type });

  // Editors only see their own uploads unless admin.
  if (user.role !== 'admin') {
    query = query.where({ uploaded_by: user.id });
  } else if (filters.uploaded_by) {
    const uid = Number(filters.uploaded_by);
    if (Number.isInteger(uid) && uid > 0) query = query.where({ uploaded_by: uid });
  }

  const countQuery = query.clone().clearSelect().count({ total: '*' }).first();
  const { total } = await countQuery;

  const rows = await query.clone().orderBy('created_at', 'desc').orderBy('id', 'desc').limit(limit).offset(offset);
  return {
    data: rows.map(toPublicMedia),
    pagination: { page, limit, total: Number(total) || 0 },
  };
}

/**
 * Stores an uploaded file on the volume and records it in `media`.
 *
 * `tempPath` is a finished temporary file produced by the upload middleware.
 * The storage layer validates the real bytes, moves the file to its permanent
 * path and removes the temporary file on any failure, so a rejected upload
 * leaves nothing on the volume. If the database insert fails after that move,
 * the stored file is removed too rather than becoming an orphan.
 */
async function storeUploadedMedia(user, payload) {
  const mediaType = payload.media_type;

  if (!storageService.ALLOWED_FORMATS[mediaType]) {
    await storageService.removeQuietly(payload.temp_path);
    throw httpError(400, 'INVALID_MEDIA_TYPE', 'Invalid media type');
  }

  const stored = await storageService.commitUpload(mediaType, payload.temp_path);

  try {
    const [id] = await db('media').insert({
      media_type: mediaType,
      source_type: 'upload',
      storage_provider: stored.storageProvider,
      storage_key: stored.storageKey,
      file_url: stored.fileUrl,
      file_name: payload.file_name
        ? String(payload.file_name).trim().slice(0, 255)
        : null,
      mime_type: stored.mimeType,
      file_size: stored.bytes,
      alt_text: payload.alt_text ? String(payload.alt_text).trim().slice(0, 255) : null,
      width: stored.width,
      height: stored.height,
      duration_seconds: stored.durationSeconds,
      uploaded_by: user.id,
    });

    return getMediaById(id);
  } catch (error) {
    await storageService.deleteByKey(stored.storageKey);
    throw error;
  }
}

async function getMediaReferences(mediaId) {
  const coverCount = await db('posts').where({ cover_media_id: mediaId }).count({ total: '*' }).first();
  const usageCount = await db('post_media').where({ media_id: mediaId }).count({ total: '*' }).first();
  // Pending and returned revisions hold their own media references, so an
  // asset used only by a proposed change is still in use.
  const revisionCoverCount = await db('post_revisions')
    .where({ cover_media_id: mediaId })
    .count({ total: '*' })
    .first();
  const revisionUsageCount = await db('post_revision_media')
    .where({ media_id: mediaId })
    .count({ total: '*' })
    .first();
  return {
    cover: Number(coverCount.total) || 0,
    usage: Number(usageCount.total) || 0,
    revision_cover: Number(revisionCoverCount.total) || 0,
    revision_usage: Number(revisionUsageCount.total) || 0,
  };
}

async function deleteMedia(user, id) {
  const media = await getMediaById(id);

  if (!canManageMedia(user, media)) {
    throw httpError(403, 'FORBIDDEN', 'Insufficient permissions');
  }

  const refs = await getMediaReferences(media.id);
  if (refs.cover > 0 || refs.usage > 0 || refs.revision_cover > 0 || refs.revision_usage > 0) {
    throw httpError(
      409,
      'MEDIA_IN_USE',
      'Media is referenced by posts or pending revisions and cannot be deleted',
    );
  }

  // Only locally stored uploads own a file on the volume. Externally hosted
  // media (and any row left over from a previous storage provider) has no
  // file here, so the row is simply removed.
  if (media.source_type === 'upload' && media.storage_provider === storageService.STORAGE_PROVIDER) {
    await storageService.deleteByKey(media.storage_key);
  }

  await db('media').where({ id: media.id }).delete();
}

module.exports = {
  toPublicMedia,
  getMediaById,
  listMedia,
  storeUploadedMedia,
  getMediaReferences,
  deleteMedia,
  canManageMedia,
};
