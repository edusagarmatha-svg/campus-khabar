import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { listUsers, createUser, updateUser } from '../api/users';

export default function Staff() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'editor' });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await listUsers({ limit: 100 });
      setItems(res.data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await createUser(form);
      setForm({ name: '', email: '', password: '', role: 'editor' });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item) {
    try {
      await updateUser(item.id, { is_active: !item.is_active });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function changeRole(item, role) {
    try {
      await updateUser(item.id, { role });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading) return <div className="page-center">Loading…</div>;

  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>Staff</h1>
          <p className="text-muted">Manage editor and admin accounts for the newsroom.</p>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      <form onSubmit={handleCreate} className="editor-form">
        <h2>Add staff</h2>
        <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
        <label>Password<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
        <label>Role
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="editor">Editor</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <div className="form-actions">
          <button type="submit" className="button" disabled={saving}>
            {saving ? 'Creating…' : 'Create account'}
          </button>
        </div>
      </form>

      {items.length === 0 ? (
        <div className="empty-state">
          <p>No staff accounts.</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id}>
                  <td className="cell-title">{u.name}</td>
                  <td>{u.email}</td>
                  <td>
                    <select
                      value={u.role}
                      onChange={(e) => changeRole(u, e.target.value)}
                      disabled={u.id === user?.id}
                    >
                      <option value="editor">Editor</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td>
                    <span className={`badge ${u.is_active ? 'badge--success' : 'badge--muted'}`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="row-actions">
                    <button
                      type="button"
                      className={`button button--small ${u.is_active ? 'button--secondary' : ''}`}
                      onClick={() => toggleActive(u)}
                      disabled={u.id === user?.id}
                    >
                      {u.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
