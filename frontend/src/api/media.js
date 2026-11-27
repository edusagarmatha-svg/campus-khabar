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

const MEDIA_LIMITS = {
  image: 5 * 1024 * 1024,
  video: 100 * 1024 * 1024,
  document: 10 * 1024 * 1024,
};

const ALLOWED_MIME = {
  image: ['image/jpeg', 'image/png', 'image/webp'],
  video: ['video/mp4', 'video/webm'],
  document: ['application/pdf'],
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

/**
 * Uploads a file to the API, which stores it on the server's persistent volume
 * and returns the created media row. The bytes go to our own origin, so there
 * is no third-party upload step and no signature to fetch first.
 *
 * The checks above are a convenience for the person uploading; the server
 * validates the real file contents again and is the authority.
 */
export async function uploadMedia(file, mediaType, altText = '') {
  validateMediaFile(file, mediaType);

  const formData = new FormData();
  formData.append('media_type', mediaType);
  formData.append('file_name', file.name);
  if (altText) formData.append('alt_text', altText);
  formData.append('file', file);

  const data = await apiJson('/media', { method: 'POST', body: formData });
  return data.data;
}
