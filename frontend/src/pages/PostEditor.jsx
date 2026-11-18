import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { listCategories } from '../api/categories';
import { getManagedPost, createPost, updatePost } from '../api/posts';
import { listMedia } from '../api/media';
import TipTapEditor from '../editor/TipTapEditor';
import { collectMediaIds } from '../editor/collectMediaIds';
import MediaPicker from '../components/media/MediaPicker';

export default function PostEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isEdit = Boolean(id);

  const [categories, setCategories] = useState([]);
  const [mediaList, setMediaList] = useState([]);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [postType, setPostType] = useState('news');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState('draft');
  const [content, setContent] = useState({ type: 'doc', content: [{ type: 'paragraph' }] });
  const [coverMediaId, setCoverMediaId] = useState('');
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState('inline'); // inline | cover
  const editorRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const cats = await listCategories({ all: user?.role === 'admin' });
        setCategories(cats);
        const mediaRes = await listMedia({ limit: 100 });
        setMediaList(mediaRes.data || []);
        if (isEdit) {
          const post = await getManagedPost(id);
          setTitle(post.title || '');
          setSlug(post.slug || '');
          setExcerpt(post.summary || '');
          setPostType(post.post_type || 'news');
          setCategoryId(post.category_id ? String(post.category_id) : '');
          setStatus(post.status || 'draft');
          setContent(post.content || { type: 'doc', content: [{ type: 'paragraph' }] });
          setCoverMediaId(post.cover_media_id ? String(post.cover_media_id) : '');
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isEdit, user]);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const inlineIds = collectMediaIds(content);
      const media = Array.from(inlineIds).map((mid) => ({ media_id: mid, usage_type: 'inline' }));

      const payload = {
        title,
        slug: slug || undefined,
        summary: excerpt || null,
        post_type: postType,
        category_id: categoryId ? Number(categoryId) : null,
        status,
        content,
        cover_media_id: coverMediaId ? Number(coverMediaId) : null,
        media,
      };

      if (isEdit) {
        await updatePost(id, payload);
      } else {
        await createPost(payload);
      }
      navigate('/posts');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  function insertInlineMedia(media) {
    editorRef.current?.insertImage(media);
    setShowPicker(false);
  }

  function selectCover(media) {
    setCoverMediaId(String(media.id));
    setShowPicker(false);
  }

  if (loading) return <div className="page-center">Loading…</div>;

  return (
    <section>
      <h1>{isEdit ? 'Edit post' : 'New post'}</h1>
      {error && <p className="error-text">{error}</p>}
      <form onSubmit={handleSave} className="editor-form">
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label>
          Slug (optional)
          <input value={slug} onChange={(e) => setSlug(e.target.value)} />
        </label>
        <label>
          Excerpt
          <textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} />
        </label>
        <div className="form-row">
          <label>
            Type
            <select value={postType} onChange={(e) => setPostType(e.target.value)}>
              <option value="news">News</option>
              <option value="article">Article</option>
              <option value="notice">Notice</option>
              <option value="announcement">Announcement</option>
            </select>
          </label>
          <label>
            Category
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
              <option value="">Select category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="draft">Draft</option>
              <option value="published">Published</option>
              <option value="unpublished">Unpublished</option>
            </select>
          </label>
        </div>

        <label>
          Cover media ID (optional)
          <input value={coverMediaId} onChange={(e) => setCoverMediaId(e.target.value)} placeholder="Select via picker" />
        </label>
        <button type="button" onClick={() => { setPickerMode('cover'); setShowPicker(true); }}>
          Select cover media
        </button>

        <TipTapEditor ref={editorRef} content={content} onChange={setContent} />

        <button type="button" onClick={() => { setPickerMode('inline'); setShowPicker(true); }}>
          Insert inline media
        </button>

        {showPicker && (
          <div className="modal">
            <div className="modal-card">
              <div className="modal-header">
                <h3>Select media</h3>
                <button type="button" onClick={() => setShowPicker(false)}>Close</button>
              </div>
              <MediaPicker
                onSelect={pickerMode === 'cover' ? selectCover : insertInlineMedia}
                mediaType="image"
              />
            </div>
          </div>
        )}

        <div className="form-actions">
          <button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          <button type="button" onClick={() => navigate('/posts')}>Cancel</button>
        </div>
      </form>
    </section>
  );
}
EOF