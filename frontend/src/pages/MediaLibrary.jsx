import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { listMedia, deleteMedia, uploadMedia } from '../api/media';

export default function MediaLibrary() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

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

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      await uploadMedia(file, 'image');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
      e.target.value = '';
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
      <h1>Media</h1>
      <div className="toolbar">
        <label className="button">
          {uploading ? 'Uploading…' : 'Upload image'}
          <input type="file" hidden onChange={handleUpload} disabled={uploading} />
        </label>
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="media-grid">
        {items.map((m) => (
          <div key={m.id} className="media-card">
            {m.media_type === 'image' ? (
              <img src={m.file_url} alt={m.alt_text || m.file_name} />
            ) : (
              <span>{m.file_name}</span>
            )}
            <div className="media-meta">
              <span>{m.file_name}</span>
              {(user?.role === 'admin' || m.uploaded_by === user?.id) && (
                <button onClick={() => handleDelete(m.id)}>Delete</button>
              )}
            </div>
          </div>
        ))}
      </div>
      {items.length === 0 && <p>No media.</p>}
    </section>
  );
}
