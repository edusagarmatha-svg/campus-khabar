import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getDashboard } from '../api/dashboard';
import StatusBadge from '../components/staff/StatusBadge';

function StatCard({ label, value, to, emphasis }) {
  const body = (
    <>
      <span className="stat-card__value">{value}</span>
      <span className="stat-card__label">{label}</span>
    </>
  );

  if (to) {
    return (
      <Link to={to} className={`stat-card${emphasis ? ' stat-card--emphasis' : ''}`}>
        {body}
      </Link>
    );
  }

  return <div className={`stat-card${emphasis ? ' stat-card--emphasis' : ''}`}>{body}</div>;
}

export default function Dashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getDashboard();
        if (!cancelled) setSummary(data);
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="page-center">Loading…</div>;

  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>Dashboard</h1>
          <p className="text-muted">
            {isAdmin
              ? 'Editorial overview for the whole newsroom.'
              : 'Your drafts and submissions.'}
          </p>
        </div>
        <Link to="/admin/posts/new" className="button">New post</Link>
      </div>

      {error && <p className="error-text">{error}</p>}

      {summary && (
        <>
          <div className="stat-grid">
            <StatCard label="Total posts" value={summary.posts.total} />
            <StatCard label="Drafts" value={summary.posts.draft} to="/admin/posts?status=draft" />
            <StatCard
              label="Pending review"
              value={summary.posts.pending_review}
              to={isAdmin ? '/admin/review' : '/admin/posts?status=pending_review'}
              emphasis={summary.posts.pending_review > 0}
            />
            <StatCard
              label="Changes requested"
              value={summary.posts.changes_requested}
              to="/admin/posts?status=changes_requested"
              emphasis={summary.posts.changes_requested > 0}
            />
            <StatCard label="Published" value={summary.posts.published} />
            <StatCard label="Unpublished" value={summary.posts.unpublished} />
            <StatCard label="Categories" value={summary.categories.active} to="/admin/categories" />
            <StatCard label="Media files" value={summary.media.total} to="/admin/media" />
            {isAdmin && summary.staff && (
              <StatCard label="Active staff" value={summary.staff.active} to="/admin/staff" />
            )}
          </div>

          {isAdmin && summary.posts.pending_review > 0 && (
            <div className="callout">
              <span>
                {summary.posts.pending_review} item{summary.posts.pending_review === 1 ? '' : 's'} waiting for review.
              </span>
              <Link to="/admin/review" className="button button--small">Open review queue</Link>
            </div>
          )}

          <h2>Recent activity</h2>
          {summary.recent_posts.length === 0 ? (
            <p className="text-muted">No content yet.</p>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    {isAdmin && <th>Author</th>}
                    <th>Status</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.recent_posts.map((post) => (
                    <tr key={post.id}>
                      <td>
                        <Link to={`/admin/posts/${post.id}/edit`}>{post.title}</Link>
                      </td>
                      {isAdmin && <td>{post.author_name || '—'}</td>}
                      <td><StatusBadge status={post.status} /></td>
                      <td>{new Date(post.updated_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
