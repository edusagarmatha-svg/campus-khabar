import { useEffect, useState } from 'react';
import { listMedia, uploadMedia } from '../../api/media';

export default function MediaPicker({ onSelect, mediaType = 'image' }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

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

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const media = await uploadMedia(file, mediaType);
      setItems((prev) => [media, ...prev]);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  if (loading) return <div className="page-center">Loading…</div>;

  return (
    <div className="media-picker">
      <div className="toolbar">
        <label className="button">
          {uploading ? 'Uploading…' : 'Upload'}
          <input type="file" hidden onChange={handleUpload} disabled={uploading} />
        </label>
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="media-grid">
        {items.map((m) => (
          <button key={m.id} type="button" className="media-thumb" onClick={() => onSelect(m)}>
            {m.media_type === 'image' ? (
              <img src={m.file_url} alt={m.alt_text || m.file_name} />
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
