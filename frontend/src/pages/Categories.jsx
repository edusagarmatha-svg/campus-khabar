import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { listCategories, createCategory, updateCategory, deleteCategory } from '../api/categories';

export default function Categories() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      setItems(await listCategories({ all: isAdmin }));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      await createCategory({ name: name.trim() });
      setName('');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(item) {
    try {
      await updateCategory(item.id, { is_active: !item.is_active });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this category?')) return;
    try {
      await deleteCategory(id);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading) return <div className="page-center">Loading…</div>;

  return (
    <section>
      <h1>Categories</h1>
      {error && <p className="error-text">{error}</p>}

      {isAdmin && (
        <form onSubmit={handleCreate} className="inline-form">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New category name" />
          <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add'}</button>
        </form>
      )}

      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Slug</th>
            <th>Active</th>
            {isAdmin && <th>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>{c.slug}</td>
              <td>{c.is_active ? 'Yes' : 'No'}</td>
              {isAdmin && (
                <td>
                  <button onClick={() => handleToggle(c)}>{c.is_active ? 'Deactivate' : 'Activate'}</button>
                  <button onClick={() => handleDelete(c.id)}>Delete</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && <p>No categories.</p>}
    </section>
  );
}
