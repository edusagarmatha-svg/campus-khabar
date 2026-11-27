import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { listCategories } from '../api/categories';
import {
  getManagedPost,
  createPost,
  updatePost,
  submitReview,
  listRevisions,
  createRevision,
  getRevision,
  updateRevision,
  submitRevisionReview,
  approveRevision,
} from '../api/posts';
import TipTapEditor from '../editor/TipTapEditor';
import { collectMediaIds } from '../editor/collectMediaIds';
import MediaPicker from '../components/media/MediaPicker';
import StatusBadge from '../components/staff/StatusBadge';

const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] };
const OPEN_REVISION_STATUSES = ['pending_review', 'changes_requested'];

const ADMIN_STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'pending_review', label: 'Pending review' },
  { value: 'changes_requested', label: 'Changes requested' },
  { value: 'published', label: 'Published' },
  { value: 'unpublished', label: 'Unpublished' },
];

export default function PostEditor() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const revisionParam = searchParams.get('revision');
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isEdit = Boolean(id);

  const [categories, setCategories] = useState([]);
  const [post, setPost] = useState(null);
  const [revision, setRevision] = useState(null);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [postType, setPostType] = useState('news');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState('draft');
  const [content, setContent] = useState(EMPTY_DOC);
  const [coverMediaId, setCoverMediaId] = useState('');
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [pickerMode, setPickerMode] = useState('inline'); // inline | cover | attachment
  const [pickerMediaType, setPickerMediaType] = useState('image'); // image | video
  const [attachments, setAttachments] = useState([]);
  const editorRef = useRef(null);

  const isOwner = post ? Number(post.author_id) === Number(user?.id) : true;
  // A published post is never edited in place by its editor; changes are
  // proposed through a revision that an admin must approve.
  const revisionMode = Boolean(post) && (!isAdmin || Boolean(revisionParam)) && post.status === 'published';
  // Editors are locked out while a submission or revision awaits review; an
  // admin can still edit before approving.
  const locked = Boolean(
    post &&
    !isAdmin &&
    ((post.status === 'pending_review' && !revision) ||
      (revision && revision.status === 'pending_review')),
  );

  const feedback = useMemo(() => {
    if (revision && revision.status === 'changes_requested') return revision.review_feedback;
    if (post && post.status === 'changes_requested') return post.review_feedback;
    return null;
  }, [post, revision]);

  useEffect(() => {
    (async () => {
      try {
        const cats = await listCategories({ all: isAdmin });
        setCategories(cats);

        if (!isEdit) return;

        const loadedPost = await getManagedPost(id);
        setPost(loadedPost);

        let activeRevision = null;
        if (revisionParam) {
          activeRevision = await getRevision(revisionParam);
        } else if (loadedPost.status === 'published' && !isAdmin) {
          const revisions = await listRevisions(id);
          activeRevision = (revisions || []).find((r) => OPEN_REVISION_STATUSES.includes(r.status)) || null;
        }
        setRevision(activeRevision);

        const source = activeRevision || loadedPost;
        setTitle(source.title || '');
        setSlug(activeRevision ? activeRevision.slug || '' : loadedPost.slug || '');
        setExcerpt(source.summary || '');
        setPostType(source.post_type || 'news');
        setCategoryId(source.category_id ? String(source.category_id) : '');
        setContent(source.content || EMPTY_DOC);
        setCoverMediaId(source.cover_media_id ? String(source.cover_media_id) : '');
        setAttachments(Array.isArray(source.attachments) ? source.attachments : []);
        setStatus(loadedPost.status || 'draft');
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isEdit, isAdmin, revisionParam]);

  function buildPayload() {
    const inlineIds = collectMediaIds(content);
    const media = [
      ...Array.from(inlineIds).map((mediaId) => ({ media_id: mediaId, usage_type: 'inline' })),
      ...attachments.map((m) => ({ media_id: m.id, usage_type: 'attachment' })),
    ];
    const payload = {
      title,
      summary: excerpt || null,
      post_type: postType,
      category_id: categoryId ? Number(categoryId) : null,
      content,
      cover_media_id: coverMediaId ? Number(coverMediaId) : null,
      media,
    };
    if (slug) payload.slug = slug;
    if (isAdmin && !revisionMode) payload.status = status;
    return payload;
  }

  async function saveRevision() {
    const payload = buildPayload();
    if (revision) {
      await updateRevision(revision.id, payload);
      if (revision.status === 'changes_requested') {
        await submitRevisionReview(revision.id);
      }
      return;
    }
    const created = await createRevision(id, payload);
    // A brand-new proposal is submitted for review immediately.
    setRevision(created);
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (revisionMode) {
        await saveRevision();
      } else if (isEdit) {
        await updatePost(id, buildPayload());
      } else {
        await createPost(buildPayload());
      }
      navigate('/admin/posts');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitForReview() {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (isEdit) {
        await updatePost(id, buildPayload());
        await submitReview(id);
      } else {
        const created = await createPost({ ...buildPayload(), status: 'draft' });
        await submitReview(created.id);
      }
      navigate('/admin/posts');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAdminApproveRevision() {
    if (!revision) return;
    setSaving(true);
    setError('');
    try {
      await updateRevision(revision.id, buildPayload());
      await approveRevision(revision.id);
      navigate('/admin/review');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function insertInlineMedia(media) {
    if (pickerMediaType === 'video') {
      editorRef.current?.insertVideo(media);
    } else {
      editorRef.current?.insertImage(media);
    }
    setShowPicker(false);
  }

  function addAttachment(media) {
    setAttachments((prev) => (prev.some((m) => m.id === media.id) ? prev : [...prev, media]));
    setShowPicker(false);
  }

  function selectCover(media) {
    setCoverMediaId(String(media.id));
    setShowPicker(false);
  }

  if (loading) return <div className="page-center">Loading…</div>;

  const heading = revisionMode
    ? 'Propose changes'
    : isEdit
      ? 'Edit post'
      : 'New post';

  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>{heading}</h1>
          {post && (
            <p className="text-muted">
              <StatusBadge status={revision ? revision.status : post.status} />
              {revisionMode && (
                <span className="heading-note">
                  The published version stays live until an admin approves these changes.
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      {feedback && (
        <div className="callout callout--attention">
          <strong>Editor feedback:</strong> {feedback}
        </div>
      )}

      {locked && (
        <div className="callout">
          This submission is awaiting admin review and cannot be edited. It will return here if
          changes are requested.
        </div>
      )}

      {error && <p className="error-text">{error}</p>}
      {notice && <p className="success-text">{notice}</p>}

      <form onSubmit={handleSave} className="editor-form">
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} required disabled={locked} />
        </label>
        <label>
          Slug (optional)
          <input value={slug} onChange={(e) => setSlug(e.target.value)} disabled={locked} />
        </label>
        <label>
          Excerpt
          <textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} disabled={locked} />
        </label>
        <div className="form-row">
          <label>
            Type
            <select value={postType} onChange={(e) => setPostType(e.target.value)} disabled={locked}>
              <option value="news">News</option>
              <option value="article">Article</option>
              <option value="notice">Notice</option>
              <option value="announcement">Announcement</option>
            </select>
          </label>
          <label>
            Category
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required disabled={locked}>
              <option value="">Select category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          {isAdmin && !revisionMode ? (
            <label>
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value)} disabled={locked}>
                {ADMIN_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              Publishing
              <div className="field-static">
                {revisionMode
                  ? 'Changes need admin approval'
                  : 'Submitting sends this post to an admin for approval'}
              </div>
            </label>
          )}
        </div>

        <label>
          Cover media ID (optional)
          <input
            value={coverMediaId}
            onChange={(e) => setCoverMediaId(e.target.value)}
            placeholder="Select via picker"
            disabled={locked}
          />
        </label>
        <button type="button" className="button button--secondary" disabled={locked} onClick={() => { setPickerMode('cover'); setPickerMediaType('image'); setShowPicker(true); }}>
          Select cover media
        </button>

        <TipTapEditor ref={editorRef} content={content} onChange={setContent} editable={!locked} />

        <div className="form-row">
          <button type="button" className="button button--secondary" disabled={locked} onClick={() => { setPickerMode('inline'); setPickerMediaType('image'); setShowPicker(true); }}>
            Insert image
          </button>
          <button type="button" className="button button--secondary" disabled={locked} onClick={() => { setPickerMode('inline'); setPickerMediaType('video'); setShowPicker(true); }}>
            Insert video
          </button>
        </div>

        <section className="attachments-editor">
          <h3>Attachments</h3>
          <div className="form-row">
            <button type="button" className="button button--secondary" disabled={locked} onClick={() => { setPickerMode('attachment'); setPickerMediaType('image'); setShowPicker(true); }}>
              Add image attachment
            </button>
            <button type="button" className="button button--secondary" disabled={locked} onClick={() => { setPickerMode('attachment'); setPickerMediaType('video'); setShowPicker(true); }}>
              Add video attachment
            </button>
          </div>
          {attachments.length === 0 ? (
            <p className="muted">No attachments.</p>
          ) : (
            <ul className="attachment-list">
              {attachments.map((m) => (
                <li key={m.id} className="attachment-item">
                  {m.media_type === 'video' ? (
                    <div className="attachment-thumb">
                      <video src={m.file_url} muted preload="metadata" playsInline />
                    </div>
                  ) : (
                    <div className="attachment-thumb">
                      <img src={m.file_url} alt={m.alt_text || m.file_name} />
                    </div>
                  )}
                  <span>{m.file_name}</span>
                  {!locked && (
                    <button type="button" className="button button--small button--danger" onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== m.id))}>
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {showPicker && (
          <div className="modal">
            <div className="modal-card">
              <div className="modal-header">
                <h3>Select media</h3>
                <button type="button" className="button button--text" onClick={() => setShowPicker(false)}>Close</button>
              </div>
              <MediaPicker
                onSelect={pickerMode === 'cover' ? selectCover : pickerMode === 'attachment' ? addAttachment : insertInlineMedia}
                mediaType={pickerMediaType}
              />
            </div>
          </div>
        )}

        <div className="form-actions">
          {!locked && (
            <button type="submit" className="button" disabled={saving}>
              {saving
                ? 'Saving…'
                : revisionMode
                  ? 'Submit proposed changes'
                  : 'Save'}
            </button>
          )}
          {!locked && !revisionMode && (isAdmin || isOwner) &&
            ['draft', 'changes_requested'].includes(post?.status || 'draft') && (
              <button type="button" className="button button--secondary" disabled={saving} onClick={handleSubmitForReview}>
                Submit for review
              </button>
            )}
          {isAdmin && revision && revision.status === 'pending_review' && (
            <button type="button" className="button" disabled={saving} onClick={handleAdminApproveRevision}>
              Save and approve changes
            </button>
          )}
          <button type="button" className="button button--text" onClick={() => navigate('/admin/posts')}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  );
}
