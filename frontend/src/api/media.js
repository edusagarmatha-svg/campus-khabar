import { apiJson } from './client';

export async function listMedia(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, v);
  });
  const data = await apiJson(`/media?${qs.toString()}`);
  return data;
}

export async function getMedia(id) {
  const data = await apiJson(`/media/${id}`);
  return data.data;
}

export async function deleteMedia(id) {
  await apiJson(`/media/${id}`, { method: 'DELETE' });
}

export async function getUploadSignature(mediaType) {
  const data = await apiJson('/media/signature', {
    method: 'POST',
    body: JSON.stringify({ media_type: mediaType }),
  });
  return data.data;
}

export async function registerMedia(payload) {
  const data = await apiJson('/media', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.data;
}

const MEDIA_LIMITS = {
  image: 5 * 1024 * 1024,
  video: 100 * 1024 * 1024,
};

const ALLOWED_MIME = {
  image: ['image/jpeg', 'image/png', 'image/webp'],
  video: ['video/mp4', 'video/webm'],
};

export function validateMediaFile(file, mediaType) {
  if (!ALLOWED_MIME[mediaType]) {
    throw new Error('Invalid media type');
  }
  if (!ALLOWED_MIME[mediaType].includes(file.type)) {
    throw new Error(`Unsupported file type for ${mediaType}`);
  }
  if (file.size > MEDIA_LIMITS[mediaType]) {
    throw new Error(`File exceeds maximum size of ${MEDIA_LIMITS[mediaType]} bytes`);
  }
}

export function getImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image dimensions'));
    };
    img.src = url;
  });
}

export async function uploadMedia(file, mediaType, altText = '') {
  validateMediaFile(file, mediaType);
  const signature = await getUploadSignature(mediaType);
  const resourceType = signature.resource_type;
  const url = `https://api.cloudinary.com/v1_1/${signature.cloud_name}/${resourceType}/upload`;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('api_key', signature.api_key);
  formData.append('timestamp', signature.timestamp);
  formData.append('signature', signature.signature);
  formData.append('folder', signature.folder);
  formData.append('allowed_formats', signature.allowed_formats);

  const res = await fetch(url, { method: 'POST', body: formData });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data?.error?.message || 'Upload failed');
    err.status = res.status;
    throw err;
  }

  return registerMedia({
    media_type: mediaType,
    public_id: data.public_id,
    file_name: file.name,
    alt_text: altText,
  });
}
