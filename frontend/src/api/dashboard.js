import { apiJson } from './client';

export async function getDashboard() {
  const data = await apiJson('/admin/dashboard');
  return data.data;
}
