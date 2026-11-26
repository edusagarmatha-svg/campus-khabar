import { useEffect, useState } from 'react';
import { listMedia, uploadMedia, getImageDimensions } from '../../api/media';

const RECOMMENDED_WIDTH = 1200;
const RECOMMENDED_HEIGHT = 675;
const MIN_WIDTH = 800;
const MIN_HEIGHT = 450;

export default function MediaPicker({ onSelect, mediaType = 'image' }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [dimensions, setDimensions] = useState(null);
  const [dimensionWarning, setDimensionWarning] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await listMedia({ media_type: mediaType, limit: 100 });
      setItems(res.data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [mediaType]);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setDimensionWarning('');
    try {
      if (mediaType === 'image') {
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
      const media = await uploadMedia(pendingFile, mediaType);
      setItems((prev) => [media, ...prev]);
      cancelPending();
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  if (loading) return <div className="page-center">Loading…</div>;

  return (
    <div className="media-picker">
      <p className="text-muted" style={{ margin: '0 0 var(--space-2)', fontSize: '0.85rem' }}>
        Recommended image size: {RECOMMENDED_WIDTH}×{RECOMMENDED_HEIGHT}px (16:9). Minimum {MIN_WIDTH}×{MIN_HEIGHT}px. Preferred formats: WebP, JPEG.
      </p>
      <div className="toolbar">
        <label className="button">
          {uploading ? 'Uploading…' : 'Choose file'}
          <input
            type="file"
            hidden
            accept={mediaType === 'image' ? 'image/*' : mediaType === 'video' ? 'video/*' : undefined}
            onChange={handleFileChange}
            disabled={uploading}
          />
        </label>
      </div>
      {pendingFile && previewUrl && (
        <div className="media-preview" style={{ margin: 'var(--space-3) 0', padding: 'var(--space-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg)' }}>
          {mediaType === 'image' ? (
            <img src={previewUrl} alt="Preview" style={{ maxWidth: '100%', maxHeight: 240, objectFit: 'contain', display: 'block', margin: '0 auto' }} />
          ) : (
            <video src={previewUrl} controls style={{ maxWidth: '100%', maxHeight: 240, display: 'block', margin: '0 auto' }} />
          )}
          {dimensions && (
            <p style={{ margin: 'var(--space-2) 0 0', fontSize: '0.85rem', color: 'var(--muted)' }}>
              Dimensions: {dimensions.width}×{dimensions.height}px
              {dimensions.width === RECOMMENDED_WIDTH && dimensions.height === RECOMMENDED_HEIGHT ? ' (recommended)' : ''}
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
      <div className="media-grid">
        {items.map((m) => (
          <button key={m.id} type="button" className="media-thumb" onClick={() => onSelect(m)}>
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
          </button>
        ))}
      </div>
      {items.length === 0 && <p>No media.</p>}
    </div>
  );
}
