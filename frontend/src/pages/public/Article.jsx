import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import Seo from '../../components/public/Seo';
import TipTapRenderer from '../../components/public/TipTapRenderer';
import { getPublicPost } from '../../api/posts';

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

export default function Article() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await getPublicPost(slug);
        setPost(data);
      } catch (e) {
        setError(e.message || 'Not found');
        if (e.status === 404) {
          // keep on page with message
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  if (loading) {
    return <div className="container page-center"><p>Loading…</p></div>;
  }

  if (error || !post) {
    return (
      <div className="container page-center">
        <div>
          <h1>Article not found</h1>
          <p className="muted">{error}</p>
          <button onClick={() => navigate('/')}>Back to home</button>
        </div>
      </div>
    );
  }

  const cover = post.cover_image;

  return (
    <article className="article-page">
      <Seo
        title={`${post.title} — Campus Kabar`}
        description={post.summary || ''}
        image={cover ? cover.file_url : undefined}
        type="article"
      />
      <div className="container-narrow">
        <header className="article-header">
          <span className="kicker">{post.post_type}</span>
          <h1 className="article-title">{post.title}</h1>
          {post.summary && <p className="article-summary">{post.summary}</p>}
          <div className="article-meta">
            <time dateTime={post.published_at}>{formatDate(post.published_at)}</time>
          </div>
        </header>

        {cover && cover.file_url && (
          <figure className="article-cover">
            <img
              src={cover.file_url}
              alt={cover.alt_text || post.title}
              width={cover.width || undefined}
              height={cover.height || undefined}
            />
            {cover.alt_text && <figcaption>{cover.alt_text}</figcaption>}
          </figure>
        )}

        <TipTapRenderer content={post.content} />

        <div className="article-footer">
          <Link to="/">← Back to home</Link>
        </div>
      </div>
    </article>
  );
}