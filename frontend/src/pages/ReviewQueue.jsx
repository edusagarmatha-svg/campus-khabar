import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  listReviewQueue,
  approvePost,
  requestChanges,
  approveRevision,
  requestRevisionChanges,
} from '../api/posts';
import StatusBadge from '../components/staff/StatusBadge';

export default function ReviewQueue() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [feedbackFor, setFeedbackFor] = useState(null);
  const [feedback, setFeedback] = useState('');

  async function load() {
    setError('');
    try {
      const res = await listReviewQueue({ limit: 100 });
      setItems(res.data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await listReviewQueue({ limit: 100 });
        if (cancelled) return;
        setItems(res.data || []);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleApprove(item) {
    setBusyId(`${item.item_type}-${item.id}`);
    setError('');
    setNotice('');
    try {
      if (item.item_type === 'revision') {
        await approveRevision(item.id);
        setNotice(`Applied the proposed changes to “${item.title}”.`);
      } else {
        await approvePost(item.id);
        setNotice(`Published “${item.title}”.`);
      }
      await load();
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
    setBusyId(`${feedbackFor.item_type}-${feedbackFor.id}`);
    setError('');
    setNotice('');
    try {
      if (feedbackFor.item_type === 'revision') {
        await requestRevisionChanges(feedbackFor.id, feedback.trim());
      } else {
        await requestChanges(feedbackFor.id, feedback.trim());
      }
      setNotice(`Changes requested for “${feedbackFor.title}”. The published version is untouched if one exists.`);
      setFeedbackFor(null);
      setFeedback('');
      await load();
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
          <h1>Review queue</h1>
          <p className="text-muted">
            Submissions waiting for approval. Editors cannot publish until you approve them.
          </p>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}
      {notice && <p className="success-text">{notice}</p>}

      {loading ? (
        <div className="page-center">Loading…</div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <p>Nothing is waiting for review.</p>
          <Link to="/admin/posts" className="button button--secondary">Back to posts</Link>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Author</th>
                <th>Submitted</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const key = `${item.item_type}-${item.id}`;
                const busy = busyId === key;
                const editPath =
                  item.item_type === 'revision'
                    ? `/admin/posts/${item.post_id}/edit?revision=${item.id}`
                    : `/admin/posts/${item.post_id}/edit`;
                return (
                  <tr key={key}>
                    <td>
                      <Link to={editPath}>{item.title}</Link>
                    </td>
                    <td>{item.item_type === 'revision' ? 'Proposed changes' : 'New post'}</td>
                    <td>{item.author?.name || '—'}</td>
                    <td>{item.submitted_at ? new Date(item.submitted_at).toLocaleString() : '—'}</td>
                    <td><StatusBadge status={item.status} /></td>
                    <td className="row-actions">
                      <Link to={editPath} className="button button--small button--secondary">
                        Edit
                      </Link>
                      <button
                        type="button"
                        className="button button--small"
                        disabled={busy}
                        onClick={() => handleApprove(item)}
                      >
                        {busy ? 'Working…' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        className="button button--small button--secondary"
                        disabled={busy}
                        onClick={() => {
                          setFeedbackFor(item);
                          setFeedback('');
                          setError('');
                        }}
                      >
                        Request changes
                      </button>
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
            <button type="submit" className="button" disabled={busyId !== null}>
              Send back to editor
            </button>
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
    </section>
  );
}
