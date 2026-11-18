const db = require('../db/knex');
const { httpError } = require('../utils/errors');
const cloudinaryService = require('./cloudinaryService');

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

async function registerUploadedMedia(user, payload) {
  const mediaType = payload.media_type;
  if (!cloudinaryService.ALLOWED_FORMATS[mediaType]) {
    throw httpError(400, 'INVALID_MEDIA_TYPE', 'Invalid media type');
  }

  if (!payload.public_id || typeof payload.public_id !== 'string') {
    throw httpError(400, 'INVALID_PUBLIC_ID', 'public_id is required');
  }

  const publicId = payload.public_id.trim();
  if (publicId.length === 0 || publicId.length > 512) {
    throw httpError(400, 'INVALID_PUBLIC_ID', 'public_id is invalid');
  }

  const { resourceType, result } = await cloudinaryService.fetchResource(mediaType, publicId);

  // Ensure the asset's resource type matches the requested media type.
  if (result.resource_type && result.resource_type !== resourceType) {
    throw httpError(400, 'ASSET_TYPE_MISMATCH', 'Asset resource type does not match');
  }

  const { bytes, mime } = cloudinaryService.validateResource(mediaType, result);

  const width = result.width ? Number(result.width) : null;
  const height = result.height ? Number(result.height) : null;
  const duration = result.duration ? Number(result.duration) : null;

  const storageProvider = 'cloudinary';
  const storageKey = publicId;

  const existing = await db('media')
    .where({ storage_provider: storageProvider, storage_key: storageKey })
    .first();

  if (existing) {
    return toPublicMedia(existing);
  }

  const [id] = await db('media').insert({
    media_type: mediaType,
    source_type: 'upload',
    storage_provider: storageProvider,
    storage_key: storageKey,
    file_url: result.secure_url,
    file_name: payload.file_name ? String(payload.file_name).trim().slice(0, 255) : (result.original_filename || null),
    mime_type: mime,
    file_size: bytes,
    alt_text: payload.alt_text ? String(payload.alt_text).trim().slice(0, 255) : null,
    width: Number.isFinite(width) ? width : null,
    height: Number.isFinite(height) ? height : null,
    duration_seconds: Number.isFinite(duration) ? duration : null,
    uploaded_by: user.id,
  });

  return getMediaById(id);
}

async function getMediaReferences(mediaId) {
  const coverCount = await db('posts').where({ cover_media_id: mediaId }).count({ total: '*' }).first();
  const usageCount = await db('post_media').where({ media_id: mediaId }).count({ total: '*' }).first();
  return {
    cover: Number(coverCount.total) || 0,
    usage: Number(usageCount.total) || 0,
  };
}

async function deleteMedia(user, id) {
  const media = await getMediaById(id);

  if (!canManageMedia(user, media)) {
    throw httpError(403, 'FORBIDDEN', 'Insufficient permissions');
  }

  const refs = await getMediaReferences(media.id);
  if (refs.cover > 0 || refs.usage > 0) {
    throw httpError(409, 'MEDIA_IN_USE', 'Media is referenced by posts and cannot be deleted');
  }

  // Only attempt remote deletion for uploaded assets.
  if (media.source_type === 'upload' && media.storage_provider === 'cloudinary') {
    await cloudinaryService.deleteResource(media.media_type, media.storage_key);
  }

  await db('media').where({ id: media.id }).delete();
}

module.exports = {
  toPublicMedia,
  getMediaById,
  listMedia,
  registerUploadedMedia,
  getMediaReferences,
  deleteMedia,
  canManageMedia,
};
