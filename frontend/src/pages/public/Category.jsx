import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Seo from '../../components/public/Seo';
import { listPublicPosts } from '../../api/posts';
import { listCategories } from '../../api/categories';

function formatDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return '';
  }
}

export default function Category() {
  const { slug } = useParams();
  const [category, setCategory] = useState(null);
  const [posts, setPosts] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [limit] = useState(12);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const cats = await listCategories();
        const found = (Array.isArray(cats) ? cats : []).find((c) => c.slug === slug);
        setCategory(found || { name: slug, slug });
      } catch {
        setCategory({ name: slug, slug });
      }
    })();
  }, [slug]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await listPublicPosts({ category: slug, page, limit });
        setPosts(res.data || []);
        setTotal(res.pagination ? res.pagination.total : 0);
      } catch {
        setPosts([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug, page, limit]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="container section">
      <Seo title={`${category ? category.name : slug} — Campus Kabar`} />
      <header className="page-header">
        <h1>{category ? category.name : slug}</h1>
        {category && category.description && <p className="page-subtitle">{category.description}</p>}
      </header>

      {loading ? (
        <p>Loading…</p>
      ) : posts.length === 0 ? (
        <div className="empty-state">
          <h3>No stories yet</h3>
          <p>Check back soon for updates in this category.</p>
        </div>
      ) : (
        <>
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