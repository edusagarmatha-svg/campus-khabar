import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { listUsers, createUser, updateUser } from '../api/users';
import PasswordInput from '../components/forms/PasswordInput';

export default function Staff() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'editor' });
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', password: '' });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

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

  function openEdit(item) {
    setEditing(item);
    setEditForm({ name: item.name || '', email: item.email || '', password: '' });
    setEditError('');
  }

  async function handleEdit(e) {
    e.preventDefault();
    setEditSaving(true);
    setEditError('');
    try {
      const payload = { name: editForm.name, email: editForm.email };
      if (editForm.password !== '') payload.password = editForm.password;
      await updateUser(editing.id, payload);
      setEditing(null);
      await load();
    } catch (err) {
      setEditError(err.message);
    } finally {
      setEditSaving(false);
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
        <label>Password
          <PasswordInput
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            autoComplete="new-password"
            minLength={12}
            required
          />
        </label>
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
                      className="button button--small button--secondary"
                      onClick={() => openEdit(u)}
                    >
                      Edit
                    </button>
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

      {editing && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="edit-user-title">
          <div className="modal-card">
            <div className="modal-header">
              <h3 id="edit-user-title">Edit {editing.name}</h3>
              <button type="button" className="button button--text" onClick={() => setEditing(null)}>
                Close
              </button>
            </div>
            <form onSubmit={handleEdit} className="editor-form">
              <label>
                Name
                <input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  required
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  required
                />
              </label>
              <label>
                New password
                <PasswordInput
                  value={editForm.password}
                  onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                  autoComplete="new-password"
                  minLength={12}
                  placeholder="Leave blank to keep current password"
                />
              </label>
              <p className="text-muted">
                Leave the password blank to keep the current one. New passwords must be at least 12 characters.
              </p>
              {editError && <p className="error-text">{editError}</p>}
              <div className="form-actions">
                <button type="submit" className="button" disabled={editSaving}>
                  {editSaving ? 'Saving…' : 'Save changes'}
                </button>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => setEditing(null)}
                  disabled={editSaving}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
