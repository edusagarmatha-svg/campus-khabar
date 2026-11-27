import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { listMedia, deleteMedia, uploadMedia, getImageDimensions } from '../api/media';

const RECOMMENDED_WIDTH = 1200;
const RECOMMENDED_HEIGHT = 675;
const MIN_WIDTH = 800;
const MIN_HEIGHT = 450;

export default function MediaLibrary() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadType, setUploadType] = useState('image');
  const [pendingFile, setPendingFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [dimensions, setDimensions] = useState(null);
  const [dimensionWarning, setDimensionWarning] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await listMedia({ limit: 100 });
      setItems(res.data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleFileSelect(e, type) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setDimensionWarning('');
    setUploadType(type);
    try {
      if (type === 'image') {
        const dims = await getImageDimensions(file);
        setDimensions(dims);
        if (dims.width < MIN_WIDTH || dims.height < MIN_HEIGHT) {
          setDimensionWarning(
            `Image is smaller than the recommended ${MIN_WIDTH}×${MIN_HEIGHT}px. It may appear soft.`,
          );
        }
      } else {
        setDimensions(null);
      }
      setPendingFile(file);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(file));
    } catch (err) {
      setError(err.message || 'Could not read file');
    }
  }

  function cancelPending() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingFile(null);
    setPreviewUrl('');
    setDimensions(null);
    setDimensionWarning('');
  }

  async function handleUpload() {
    if (!pendingFile) return;
    setUploading(true);
    setError('');
    try {
      await uploadMedia(pendingFile, uploadType);
      await load();
      cancelPending();
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Delete this media?')) return;
    try {
      await deleteMedia(id);
      setItems((prev) => prev.filter((m) => m.id !== id));
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading) return <div className="page-center">Loading…</div>;

  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>Media</h1>
          <p className="text-muted">Upload and manage images and files for the newsroom.</p>
        </div>
      </div>

      <p className="text-muted" style={{ margin: '0 0 var(--space-3)', fontSize: '0.85rem' }}>
        Recommended image size: {RECOMMENDED_WIDTH}×{RECOMMENDED_HEIGHT}px (16:9). Minimum {MIN_WIDTH}×{MIN_HEIGHT}px. Preferred formats: WebP, JPEG.
      </p>
      <div className="toolbar">
        <label className="button">
          {uploading ? 'Uploading…' : 'Upload image'}
          <input type="file" accept="image/*" hidden onChange={(e) => handleFileSelect(e, 'image')} disabled={uploading} />
        </label>
        <label className="button">
          {uploading ? 'Uploading…' : 'Upload video'}
          <input type="file" accept="video/*" hidden onChange={(e) => handleFileSelect(e, 'video')} disabled={uploading} />
        </label>
      </div>
      {pendingFile && previewUrl && (
        <div className="media-preview" style={{ margin: 'var(--space-3) 0', padding: 'var(--space-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg)' }}>
          {uploadType === 'image' ? (
            <img src={previewUrl} alt="Preview" style={{ maxWidth: '100%', maxHeight: 240, objectFit: 'contain', display: 'block', margin: '0 auto' }} />
          ) : (
            <video src={previewUrl} controls style={{ maxWidth: '100%', maxHeight: 240, display: 'block', margin: '0 auto' }} />
          )}
          {dimensions && (
            <p style={{ margin: 'var(--space-2) 0 0', fontSize: '0.85rem', color: 'var(--muted)' }}>
              Dimensions: {dimensions.width}×{dimensions.height}px
            </p>
          )}
          {dimensionWarning && <p className="error-text" style={{ marginTop: 'var(--space-1)' }}>{dimensionWarning}</p>}
          <div className="form-actions" style={{ marginTop: 'var(--space-3)' }}>
            <button type="button" className="button" onClick={handleUpload} disabled={uploading}>
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
            <button type="button" className="button button--text" onClick={cancelPending} disabled={uploading}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
      {items.length === 0 ? (
        <div className="empty-state">
          <p>No media uploaded yet.</p>
          <span className="text-muted">Use the button above to add your first file.</span>
        </div>
      ) : (
        <div className="media-grid">
          {items.map((m) => (
            <div key={m.id} className="media-card">
              {m.media_type === 'image' ? (
                <div className="media-card__media">
                  <img src={m.file_url} alt={m.alt_text || m.file_name} />
                </div>
              ) : m.media_type === 'video' ? (
                <div className="media-card__media">
                  <video src={m.file_url} muted preload="metadata" playsInline />
                </div>
              ) : (
                <span>{m.file_name}</span>
              )}
              <div className="media-meta">
                <span>{m.file_name}</span>
                {(user?.role === 'admin' || m.uploaded_by === user?.id) && (
                  <button
                    type="button"
                    className="button button--small button--danger"
                    onClick={() => handleDelete(m.id)}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
