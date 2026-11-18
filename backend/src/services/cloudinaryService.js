const env = require('../config/env');
const { httpError } = require('../utils/errors');

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

const RESOURCE_TYPES = {
  image: 'image',
  video: 'video',
  document: 'raw',
};

function ensureConfigured() {
  if (!env.cloudinary.configured) {
    throw httpError(503, 'CLOUDINARY_NOT_CONFIGURED', 'Media storage is not configured');
  }
}

function getCloudinary() {
  ensureConfigured();
  // Lazy require so tests without credentials can load the module.
  const cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
    secure: true,
  });
  return cloudinary;
}

function folderFor(mediaType) {
  const base = env.cloudinary.folder || 'campus-kabar';
  const envSegment = env.isTest ? 'test' : env.isProduction ? 'prod' : 'dev';
  return `${base}/${envSegment}/${mediaType}`;
}

function generateUploadSignature(mediaType) {
  if (!ALLOWED_FORMATS[mediaType]) {
    throw httpError(400, 'INVALID_MEDIA_TYPE', 'Invalid media type');
  }
  const cloudinary = getCloudinary();
  const timestamp = Math.round(Date.now() / 1000);
  const folder = folderFor(mediaType);
  const allowed_formats = ALLOWED_FORMATS[mediaType].join(',');

  const paramsToSign = {
    timestamp,
    folder,
    allowed_formats,
  };

  const signature = cloudinary.utils.api_sign_request(paramsToSign, env.cloudinary.apiSecret);

  return {
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    timestamp,
    signature,
    folder,
    allowed_formats,
    resource_type: RESOURCE_TYPES[mediaType],
    media_type: mediaType,
  };
}

function formatToMimeType(format, mediaType) {
  const f = String(format || '').toLowerCase();
  if (mediaType === 'image') {
    if (f === 'jpg' || f === 'jpeg') return 'image/jpeg';
    if (f === 'png') return 'image/png';
    if (f === 'webp') return 'image/webp';
  }
  if (mediaType === 'video') {
    if (f === 'mp4') return 'video/mp4';
    if (f === 'webm') return 'video/webm';
  }
  if (mediaType === 'document') {
    if (f === 'pdf') return 'application/pdf';
  }
  return null;
}

async function fetchResource(mediaType, publicId) {
  const cloudinary = getCloudinary();
  const resourceType = RESOURCE_TYPES[mediaType];
  try {
    const result = await cloudinary.api.resource(publicId, { resource_type: resourceType });
    return { resourceType, result };
  } catch (error) {
    throw httpError(404, 'CLOUDINARY_ASSET_NOT_FOUND', 'Uploaded asset not found in Cloudinary');
  }
}

function validateResource(mediaType, resource) {
  const allowedFormats = ALLOWED_FORMATS[mediaType];
  const format = String(resource.format || '').toLowerCase();
  if (!allowedFormats.includes(format)) {
    throw httpError(400, 'INVALID_ASSET_FORMAT', `Unsupported format: ${format || 'unknown'}`);
  }

  const bytes = Number(resource.bytes);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    throw httpError(400, 'INVALID_ASSET_SIZE', 'Asset size is invalid');
  }
  if (bytes > MEDIA_LIMITS[mediaType]) {
    throw httpError(413, 'ASSET_TOO_LARGE', 'Asset exceeds maximum allowed size');
  }

  const mime = formatToMimeType(format, mediaType);
  if (!mime) {
    throw httpError(400, 'INVALID_ASSET_MIME', 'Unable to determine asset MIME type');
  }

  return { format, bytes, mime };
}

async function deleteResource(mediaType, publicId) {
  if (!env.cloudinary.configured) return;
  const cloudinary = getCloudinary();
  const resourceType = RESOURCE_TYPES[mediaType];
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, invalidate: true });
  } catch (error) {
    // Log but do not fail DB cleanup on remote deletion errors.
    console.error(`[media] cloudinary delete failed for ${publicId}: ${error.message}`);
  }
}

module.exports = {
  MEDIA_LIMITS,
  ALLOWED_FORMATS,
  RESOURCE_TYPES,
  isConfigured: () => env.cloudinary.configured,
  generateUploadSignature,
  fetchResource,
  validateResource,
  formatToMimeType,
  deleteResource,
};
