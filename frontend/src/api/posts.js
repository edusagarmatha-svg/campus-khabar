import { apiJson } from './client';

function buildQuery(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, v);
  });
  return qs.toString();
}

export async function listPublicPosts(params = {}) {
  return apiJson(`/posts?${buildQuery(params)}`);
}

export async function getPublicPost(slug) {
  const data = await apiJson(`/posts/${encodeURIComponent(slug)}`);
  return data.data;
}

export async function listManagedPosts(params = {}) {
  return apiJson(`/posts/manage/list?${buildQuery(params)}`);
}

export async function getManagedPost(id) {
  const data = await apiJson(`/posts/manage/${id}`);
  return data.data;
}

export async function createPost(payload) {
  const data = await apiJson('/posts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.data;
}

export async function updatePost(id, payload) {
  const data = await apiJson(`/posts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return data.data;
}

export async function deletePost(id) {
  await apiJson(`/posts/${id}`, { method: 'DELETE' });
}

export async function submitReview(id) {
  const data = await apiJson(`/posts/${id}/submit-review`, { method: 'POST' });
  return data.data;
}

export async function approvePost(id) {
  const data = await apiJson(`/posts/${id}/approve`, { method: 'POST' });
  return data.data;
}

export async function requestChanges(id, feedback) {
  const data = await apiJson(`/posts/${id}/request-changes`, {
    method: 'POST',
    body: JSON.stringify({ feedback }),
  });
  return data.data;
}

export async function listReviewQueue(params = {}) {
  return apiJson(`/posts/review-queue?${buildQuery(params)}`);
}

export async function listRevisions(postId) {
  const data = await apiJson(`/posts/${postId}/revisions`);
  return data.data;
}

export async function createRevision(postId, payload) {
  const data = await apiJson(`/posts/${postId}/revisions`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.data;
}

export async function getRevision(id) {
  const data = await apiJson(`/post-revisions/${id}`);
  return data.data;
}

export async function updateRevision(id, payload) {
  const data = await apiJson(`/post-revisions/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return data.data;
}

export async function submitRevisionReview(id) {
  const data = await apiJson(`/post-revisions/${id}/submit-review`, { method: 'POST' });
  return data.data;
}

export async function approveRevision(id) {
  const data = await apiJson(`/post-revisions/${id}/approve`, { method: 'POST' });
  return data.data;
}

export async function requestRevisionChanges(id, feedback) {
  const data = await apiJson(`/post-revisions/${id}/request-changes`, {
    method: 'POST',
    body: JSON.stringify({ feedback }),
  });
  return data.data;
}
