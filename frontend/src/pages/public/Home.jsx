import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Seo from '../../components/public/Seo';
import { absoluteUrl } from '../../config/site';
import { listPublicPosts } from '../../api/posts';
import { listCategories } from '../../api/categories';

function formatDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

function CoverImage({ post, className }) {
  const img = post.cover_image;
  if (!img || !img.file_url) {
    return <div className={`image-placeholder ${className || ''}`} aria-hidden="true" />;
  }
  return (
    <img
      src={img.file_url}
      alt={img.alt_text || post.title}
      width={img.width || undefined}
      height={img.height || undefined}
      loading="lazy"
      decoding="async"
      className={className}
    />
  );
}

export default function Home() {
  const [featured, setFeatured] = useState(null);
  const [latest, setLatest] = useState([]);
  const [categories, setCategories] = useState([]);
  const [byCategory, setByCategory] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [featRes, latestRes, cats] = await Promise.all([
          listPublicPosts({ featured: 'true', limit: 1, sort: 'featured' }),
          listPublicPosts({ limit: 8 }),
          listCategories(),
        ]);
        const featuredPost = (featRes.data || [])[0] || (latestRes.data || [])[0] || null;
        setFeatured(featuredPost);
        const rest = (latestRes.data || []).filter((p) => !featuredPost || p.id !== featuredPost.id);
        setLatest(rest.slice(0, 6));
        const activeCats = (Array.isArray(cats) ? cats : []).filter((c) => c.is_active !== false);
        setCategories(activeCats);

        const entries = {};
        await Promise.all(
          activeCats.slice(0, 4).map(async (c) => {
            const r = await listPublicPosts({ category: c.slug, limit: 4 });
            entries[c.slug] = r.data || [];
          }),
        );
        setByCategory(entries);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="container page-center">
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div className="home">
      <Seo
        title="Campus Kabar — Latest news and stories"
        description="Campus Kabar brings you the latest news, articles, notices and announcements."
        url={absoluteUrl('/')}
      />

      {featured && (
        <section className="hero-section">
          <div className="container">
            <article className="hero-article">
              <div className="hero-media">
                <CoverImage post={featured} />
              </div>
              <div className="hero-content">
                <span className="kicker">{featured.post_type}</span>
                <h1 className="hero-title">
                  <Link to={`/posts/${featured.slug}`}>{featured.title}</Link>
                </h1>
                {featured.summary && <p className="hero-summary">{featured.summary}</p>}
                <div className="hero-meta">
                  <time dateTime={featured.published_at}>{formatDate(featured.published_at)}</time>
                </div>
              </div>
            </article>
          </div>
        </section>
      )}

      {latest.length > 0 && (
        <section className="section">
          <div className="container">
            <div className="section-header">
              <h2>Latest</h2>
            </div>
            <div className="latest-grid">
              {latest.map((post) => (
                <article key={post.id} className="latest-card">
                  <Link to={`/posts/${post.slug}`} className="latest-media">
                    <CoverImage post={post} />
                  </Link>
                  <div className="latest-body">
                    <span className="kicker">{post.post_type}</span>
                    <h3 className="latest-title">
                      <Link to={`/posts/${post.slug}`}>{post.title}</Link>
                    </h3>
                    {post.summary && <p className="latest-summary">{post.summary}</p>}
                    <time className="latest-date" dateTime={post.published_at}>
                      {formatDate(post.published_at)}
                    </time>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {categories.slice(0, 4).map((cat) => {
        const posts = byCategory[cat.slug] || [];
        if (posts.length === 0) return null;
        return (
          <section key={cat.id} className="section section-alt">
            <div className="container">
              <div className="section-header">
                <h2>{cat.name}</h2>
                <Link to={`/category/${cat.slug}`} className="section-link">View all →</Link>
              </div>
              <div className="category-list">
                {posts.map((post, idx) => (
                  <article key={post.id} className={`category-item ${idx === 0 ? 'category-item-lead' : ''}`}>
                    {idx === 0 && (
                      <Link to={`/posts/${post.slug}`} className="category-item-media">
                        <CoverImage post={post} />
                      </Link>
                    )}
                    <div className="category-item-body">
                      <h3 className="category-item-title">
                        <Link to={`/posts/${post.slug}`}>{post.title}</Link>
                      </h3>
                      {post.summary && <p className="category-item-summary">{post.summary}</p>}
                      <time className="category-item-date" dateTime={post.published_at}>
                        {formatDate(post.published_at)}
                      </time>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}