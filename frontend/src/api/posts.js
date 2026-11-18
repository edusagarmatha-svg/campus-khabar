import { apiJson } from './client';

export async function listManagedPosts(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, v);
  });
  const data = await apiJson(`/posts/manage/list?${qs.toString()}`);
  return data;
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
EOF