import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import {
  listManagedPosts,
  deletePost,
  submitReview,
  approvePost,
  requestChanges,
} from '../api/posts';
import StatusBadge from '../components/staff/StatusBadge';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending_review', label: 'Pending review' },
  { value: 'changes_requested', label: 'Changes requested' },
  { value: 'published', label: 'Published' },
  { value: 'unpublished', label: 'Unpublished' },
];

const EDITABLE_STATUSES = ['draft', 'changes_requested'];

export default function PostsList() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [searchParams, setSearchParams] = useSearchParams();

  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [feedbackFor, setFeedbackFor] = useState(null);
  const [feedback, setFeedback] = useState('');

  const load = useCallback(async (page = 1, nextStatus = status) => {
    setLoading(true);
    setError('');
    try {
      const res = await listManagedPosts({
        page,
        limit: 20,
        status: nextStatus || undefined,
      });
      setItems(res.data || []);
      setPagination(res.pagination || {});
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await listManagedPosts({
          page: 1,
          limit: 20,
          status: status || undefined,
        });
        if (cancelled) return;
        setItems(res.data || []);
        setPagination(res.pagination || {});
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [status]);

  const visibleItems = q
    ? items.filter((p) => p.title.toLowerCase().includes(q.toLowerCase()))
    : items;

  function handleStatusChange(value) {
    setStatus(value);
    if (value) setSearchParams({ status: value });
    else setSearchParams({});
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this post?')) return;
    setError('');
    setNotice('');
    try {
      await deletePost(id);
      setNotice('Post deleted.');
      await load(pagination.page || 1, status);
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleSubmitReview(item) {
    setBusyId(item.id);
    setError('');
    setNotice('');
    try {
      await submitReview(item.id);
      setNotice(`“${item.title}” submitted for review.`);
      await load(pagination.page || 1, status);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleApprove(item) {
    setBusyId(item.id);
    setError('');
    setNotice('');
    try {
      await approvePost(item.id);
      setNotice(`“${item.title}” published.`);
      await load(pagination.page || 1, status);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function handleRequestChanges(e) {
    e.preventDefault();
    if (!feedbackFor) return;
    if (!feedback.trim()) {
      setError('Feedback is required when requesting changes.');
      return;
    }
    setBusyId(feedbackFor.id);
    setError('');
    setNotice('');
    try {
      await requestChanges(feedbackFor.id, feedback.trim());
      setNotice(`Changes requested for “${feedbackFor.title}”.`);
      setFeedbackFor(null);
      setFeedback('');
      await load(pagination.page || 1, status);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>Posts</h1>
          <p className="text-muted">
            {isAdmin
              ? 'Manage every post and review editor submissions.'
              : 'Draft, submit for review, and revise your returned posts.'}
          </p>
        </div>
        <Link to="/admin/posts/new" className="button">New post</Link>
      </div>

      <div className="toolbar">
        <label className="field field--inline">
          <span>Status</span>
          <select value={status} onChange={(e) => handleStatusChange(e.target.value)}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="field field--inline">
          <span>Search</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by title" />
        </label>
      </div>

      {error && <p className="error-text">{error}</p>}
      {notice && <p className="success-text">{notice}</p>}

      {loading ? (
        <div className="page-center">Loading…</div>
      ) : visibleItems.length === 0 ? (
        <div className="empty-state">
          <p>{status || q ? 'No posts match this filter.' : 'No posts yet.'}</p>
          <Link to="/admin/posts/new" className="button button--secondary">Create the first post</Link>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                {isAdmin && <th>Author</th>}
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((p) => {
                const isOwner = Number(p.author_id) === Number(user?.id);
                const canManage = isAdmin || isOwner;
                const canEdit = canManage && (isAdmin || EDITABLE_STATUSES.includes(p.status) || p.status === 'published');
                const busy = busyId === p.id;
                return (
                  <tr key={p.id}>
                    <td>
                      <div className="cell-title">{p.title}</div>
                      {p.status === 'changes_requested' && p.review_feedback && (
                        <div className="cell-feedback">Feedback: {p.review_feedback}</div>
                      )}
                    </td>
                    <td><StatusBadge status={p.status} /></td>
                    {isAdmin && <td>{p.author?.name || '—'}</td>}
                    <td>{new Date(p.updated_at).toLocaleString()}</td>
                    <td className="row-actions">
                      {p.status === 'published' && (
                        <Link to={`/posts/${p.slug}`} className="button button--small button--text">
                          View
                        </Link>
                      )}
                      {canEdit && (
                        <Link to={`/admin/posts/${p.id}/edit`} className="button button--small button--secondary">
                          {isAdmin ? 'Edit' : p.status === 'published' ? 'Propose changes' : 'Edit'}
                        </Link>
                      )}
                      {canManage && EDITABLE_STATUSES.includes(p.status) && (
                        <button
                          type="button"
                          className="button button--small"
                          disabled={busy}
                          onClick={() => handleSubmitReview(p)}
                        >
                          Submit for review
                        </button>
                      )}
                      {isAdmin && p.status === 'pending_review' && (
                        <>
                          <button
                            type="button"
                            className="button button--small"
                            disabled={busy}
                            onClick={() => handleApprove(p)}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="button button--small button--secondary"
                            disabled={busy}
                            onClick={() => { setFeedbackFor(p); setFeedback(''); setError(''); }}
                          >
                            Request changes
                          </button>
                        </>
                      )}
                      {canManage && (
                        <button
                          type="button"
                          className="button button--small button--danger"
                          onClick={() => handleDelete(p.id)}
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {feedbackFor && (
        <form className="feedback-form" onSubmit={handleRequestChanges}>
          <h3>Request changes for “{feedbackFor.title}”</h3>
          <label>
            Feedback for the editor
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={4}
              maxLength={4000}
              required
            />
          </label>
          <div className="form-actions">
            <button type="submit" className="button" disabled={busyId !== null}>Send back to editor</button>
            <button
              type="button"
              className="button button--text"
              onClick={() => { setFeedbackFor(null); setFeedback(''); }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="pagination">
        {pagination.page > 1 && (
          <button type="button" className="button button--secondary button--small" onClick={() => load(pagination.page - 1, status)}>
            Prev
          </button>
        )}
        <span>Page {pagination.page || 1}</span>
        {pagination.page < Math.ceil((pagination.total || 0) / (pagination.limit || 20)) && (
          <button type="button" className="button button--secondary button--small" onClick={() => load(pagination.page + 1, status)}>
            Next
          </button>
        )}
      </div>
    </section>
  );
}
