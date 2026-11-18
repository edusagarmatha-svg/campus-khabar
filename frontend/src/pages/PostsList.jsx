import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { listManagedPosts, deletePost } from '../api/posts';

const STATUSES = ['', 'draft', 'published', 'unpublished'];

export default function PostsList() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');

  async function load(page = 1) {
    setLoading(true);
    setError('');
    try {
      const res = await listManagedPosts({ page, limit: 20, status: status || undefined, q: q || undefined });
      setItems(res.data || []);
      setPagination(res.pagination || {});
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(1); }, []);

  async function handleDelete(id) {
    if (!window.confirm('Delete this post?')) return;
    try {
      await deletePost(id);
      await load(pagination.page || 1);
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading) return <div className="page-center">Loading…</div>;

  return (
    <section>
      <h1>Posts</h1>
      <div className="toolbar">
        <Link to="/posts/new" className="button">New post</Link>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title" />
        <button onClick={() => load(1)}>Apply</button>
      </div>
      {error && <p className="error-text">{error}</p>}

      <table className="data-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Status</th>
            <th>Category</th>
            <th>Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id}>
              <td>{p.title}</td>
              <td>{p.status}</td>
              <td>{p.category_id ?? '—'}</td>
              <td>{new Date(p.updated_at).toLocaleString()}</td>
              <td>
                <Link to={`/posts/${p.id}/edit`}>Edit</Link>
                {isAdmin && <button onClick={() => handleDelete(p.id)}>Delete</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && <p>No posts.</p>}
      <div className="pagination">
        {pagination.page > 1 && <button onClick={() => load(pagination.page - 1)}>Prev</button>}
        <span>Page {pagination.page || 1}</span>
        {pagination.page < Math.ceil((pagination.total || 0) / (pagination.limit || 20)) && (
          <button onClick={() => load(pagination.page + 1)}>Next</button>
        )}
      </div>
    </section>
  );
}
EOF