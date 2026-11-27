import { apiJson } from './client';

export async function listUsers(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') qs.set(k, v);
  });
  const data = await apiJson(`/users?${qs.toString()}`);
  return data;
}

export async function getUser(id) {
  const data = await apiJson(`/users/${id}`);
  return data.data;
}

export async function createUser(payload) {
  const data = await apiJson('/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return data.data;
}

export async function updateUser(id, payload) {
  const data = await apiJson(`/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return data.data;
}
