import { apiJson } from './client';

export async function listCategories({ all = false } = {}) {
  const qs = all ? '?all=true' : '';
  const data = await apiJson(`/categories${qs}`);
  return data.data || [];
}

export async function getCategory(id) {
  const data = await apiJson(`/categories/${id}`);
  return data.data;
}

export async function createCategory(payload) {
  const data = await apiJson('/categories', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.data;
}

export async function updateCategory(id, payload) {
  const data = await apiJson(`/categories/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return data.data;
}

export async function deleteCategory(id) {
  await apiJson(`/categories/${id}`, { method: 'DELETE' });
}
