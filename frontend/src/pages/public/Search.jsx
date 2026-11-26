import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import Seo from '../../components/public/Seo';
import { listPublicPosts } from '../../api/posts';

function formatDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') || '';
  const [input, setInput] = useState(q);
  const [posts, setPosts] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const limit = 12;

  useEffect(() => {
    if (!q.trim()) {
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const res = await listPublicPosts({ q, page, limit });
        setPosts(res.data || []);
        setTotal(res.pagination ? res.pagination.total : 0);
      } catch {
        setPosts([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [q, page]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = input.trim();
    setPage(1);
    setSearchParams(trimmed ? { q: trimmed } : {});
  }

  return (
    <div className="container section">
      <Seo title={q ? `Search: ${q} — Campus Kabar` : 'Search — Campus Kabar'} />
      <header className="page-header">
        <h1>Search</h1>
      </header>

      <form onSubmit={handleSubmit} className="search-form">
        <input
          type="search"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search articles…"
          aria-label="Search"
        />
        <button type="submit">Search</button>
      </form>

      {!q.trim() ? (
        <p className="muted">Enter a keyword to search.</p>
      ) : loading ? (
        <p>Loading…</p>
      ) : posts.length === 0 ? (
        <div className="empty-state">
          <h3>No results found</h3>
          <p>Try a different keyword or browse categories.</p>
        </div>
      ) : (
        <>
          <p className="search-count">{total} result{total === 1 ? '' : 's'}</p>
          <div className="listing-grid">
            {posts.map((post) => (
              <article key={post.id} className="listing-card">
                <Link to={`/posts/${post.slug}`} className="listing-media">
                  {post.cover_image && post.cover_image.file_url ? (
                    <img
                      src={post.cover_image.file_url}
                      alt={post.cover_image.alt_text || post.title}
                      width={post.cover_image.width || undefined}
                      height={post.cover_image.height || undefined}
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="image-placeholder" aria-hidden="true" />
                  )}
                </Link>
                <div className="listing-body">
                  <h2 className="listing-title">
                    <Link to={`/posts/${post.slug}`}>{post.title}</Link>
                  </h2>
                  {post.summary && <p className="listing-summary">{post.summary}</p>}
                  <time className="listing-date" dateTime={post.published_at}>
                    {formatDate(post.published_at)}
                  </time>
                </div>
              </article>
            ))}
          </div>

          {totalPages > 1 && (
            <nav className="pagination" aria-label="Pagination">
              <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Previous
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                Next
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}