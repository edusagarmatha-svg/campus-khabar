const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const bcrypt = require('bcrypt');
const request = require('supertest');

// Uploads must land in a throwaway directory, never in the developer's real
// storage volume. This has to happen before src/config/env is loaded, because
// that module resolves and creates the storage directories on require.
const TEST_STORAGE_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-kabar-media-'));
process.env.MEDIA_STORAGE_PATH = TEST_STORAGE_ROOT;

const env = require('../src/config/env');
const db = require('../src/db/knex');
const app = require('../src/app');
const storageService = require('../src/services/storageService');

if (env.db.database !== 'campus_kabar_test') {
  throw new Error(`Refusing to run media tests against database "${env.db.database}"`);
}
if (env.db.port !== 3308) {
  throw new Error(`Refusing to run media tests against port ${env.db.port}; expected 3308`);
}

// A 1x1 PNG, a 1x1 JPEG and a minimal PDF. Real signatures matter: the server
// identifies files by their leading bytes and ignores the declared MIME type.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
);
const JPEG_1X1 = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwcJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPDc0NP/AABEIAAEAAQMBIgACEQEDEQH/xAAfAAABBQEBAQEBAQAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/aAAwDAQACEQMRAD8A/v4oooA//9k=',
  'base64',
);
const PDF_MINIMAL = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n', 'utf8');

function uploadedPath(media) {
  return path.join(storageService.mediaRoot(), media.storage_key);
}

const createdUserIds = new Set();
const createdCategoryIds = new Set();
const createdPostIds = new Set();
const createdMediaIds = new Set();

async function createUser(overrides = {}) {
  const password = overrides.password || 'test-password-1234';
  const passwordHash = await bcrypt.hash(password, 4);
  const email =
    overrides.email ||
    `media-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;

  const [id] = await db('users').insert({
    name: overrides.name || 'Media Test User',
    email,
    password_hash: passwordHash,
    role: overrides.role || 'editor',
    is_active: true,
  });

  createdUserIds.add(id);
  return { id, email, password, role: overrides.role || 'editor' };
}

async function login(user) {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: user.email, password: user.password })
    .expect(200);
  return res.body.accessToken;
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

async function createMedia(uploadedBy, overrides = {}) {
  const [id] = await db('media').insert({
    media_type: overrides.media_type || 'image',
    source_type: overrides.source_type || 'external',
    storage_provider: overrides.storage_provider || 'external',
    storage_key: overrides.storage_key || `test/${Date.now()}/${Math.random()}`,
    file_url: overrides.file_url || 'https://example.com/x.jpg',
    file_name: overrides.file_name || 'x.jpg',
    mime_type: overrides.mime_type || 'image/jpeg',
    file_size: overrides.file_size === undefined ? 100 : overrides.file_size,
    uploaded_by: uploadedBy || null,
  });
  createdMediaIds.add(id);
  return id;
}

async function createCategory(adminToken) {
  const res = await request(app)
    .post('/api/categories')
    .set(authHeader(adminToken))
    .send({ name: `MediaCat ${Date.now()}` })
    .expect(201);
  createdCategoryIds.add(res.body.data.id);
  return res.body.data.id;
}

test.after(async () => {
  if (createdPostIds.size > 0) {
    const ids = [...createdPostIds];
    await db('post_media').whereIn('post_id', ids).delete();
    await db('posts').whereIn('id', ids).delete();
  }
  if (createdCategoryIds.size > 0) {
    await db('categories').whereIn('id', [...createdCategoryIds]).delete();
  }
  if (createdMediaIds.size > 0) {
    await db('media').whereIn('id', [...createdMediaIds]).delete();
  }
  if (createdUserIds.size > 0) {
    const ids = [...createdUserIds];
    await db('refresh_tokens').whereIn('user_id', ids).delete();
    await db('users').whereIn('id', ids).delete();
  }
  await db.destroy();
  await fsp.rm(TEST_STORAGE_ROOT, { recursive: true, force: true });
});

test('unauthenticated media requests are rejected', async () => {
  await request(app).get('/api/media').expect(401);
  await request(app).get('/api/media/1').expect(401);
  await request(app)
    .post('/api/media')
    .field('media_type', 'image')
    .attach('file', PNG_1X1, 'tiny.png')
    .expect(401);
  await request(app).delete('/api/media/1').expect(401);
});

test('editor can list own media', async () => {
  const editor = await createUser({ role: 'editor' });
  const token = await login(editor);

  const mediaId = await createMedia(editor.id);
  const listRes = await request(app)
    .get('/api/media')
    .set(authHeader(token))
    .expect(200);
  assert.ok(listRes.body.data.some((m) => m.id === mediaId));
});

test('editor uploads an image, which is stored on the volume and served', async () => {
  const editor = await createUser({ role: 'editor' });
  const token = await login(editor);

  const res = await request(app)
    .post('/api/media')
    .set(authHeader(token))
    .field('media_type', 'image')
    .field('alt_text', 'A tiny test image')
    .attach('file', PNG_1X1, 'tiny.png')
    .expect(201);

  const media = res.body.data;
  createdMediaIds.add(media.id);

  assert.equal(media.media_type, 'image');
  assert.equal(media.source_type, 'upload');
  assert.equal(media.storage_provider, 'local');
  assert.equal(media.mime_type, 'image/png');
  assert.equal(media.file_size, PNG_1X1.length);
  assert.equal(media.alt_text, 'A tiny test image');
  assert.equal(media.file_name, 'tiny.png');
  assert.equal(media.width, 1);
  assert.equal(media.height, 1);

  // The URL is relative so it keeps working across domains and environments.
  assert.match(media.file_url, /^\/uploads\/test\/image\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/);
  assert.equal(media.file_url, `/uploads/${media.storage_key}`);

  // The bytes really are on the volume, and the API serves them back.
  assert.deepEqual(await fsp.readFile(uploadedPath(media)), PNG_1X1);

  const fileRes = await request(app).get(media.file_url).expect(200);
  assert.equal(fileRes.headers['content-type'], 'image/png');
  assert.match(fileRes.headers['cache-control'], /immutable/);
  assert.deepEqual(fileRes.body, PNG_1X1);
});

test('uploaded media is public without authentication but the directory is not browsable', async () => {
  const editor = await createUser({ role: 'editor' });
  const token = await login(editor);

  const res = await request(app)
    .post('/api/media')
    .set(authHeader(token))
    .field('media_type', 'image')
    .attach('file', JPEG_1X1, 'tiny.jpg')
    .expect(201);
  createdMediaIds.add(res.body.data.id);

  // No Authorization header: published articles must load for readers.
  await request(app).get(res.body.data.file_url).expect(200);

  // Directory listings and writes through the media path are refused.
  await request(app).get('/uploads/test/image/').expect(404);
  await request(app).post(res.body.data.file_url).expect(405);
});

test('a document upload is accepted and typed from its contents', async () => {
  const editor = await createUser({ role: 'editor' });
  const token = await login(editor);

  const res = await request(app)
    .post('/api/media')
    .set(authHeader(token))
    .field('media_type', 'document')
    .attach('file', PDF_MINIMAL, 'notice.pdf')
    .expect(201);
  createdMediaIds.add(res.body.data.id);

  assert.equal(res.body.data.mime_type, 'application/pdf');
  assert.equal(res.body.data.media_type, 'document');
  assert.match(res.body.data.storage_key, /^test\/document\//);
});

test('a file whose contents do not match its name or declared type is rejected', async () => {
  const editor = await createUser({ role: 'editor' });
  const token = await login(editor);

  // A PDF renamed to .png and declared image/png: only the bytes are trusted.
  const res = await request(app)
    .post('/api/media')
    .set(authHeader(token))
    .field('media_type', 'image')
    .attach('file', PDF_MINIMAL, { filename: 'disguised.png', contentType: 'image/png' })
    .expect(400);
  assert.equal(res.body.error.code, 'INVALID_ASSET_FORMAT');

  // An image uploaded as a video is a type mismatch, not a valid video.
  const mismatch = await request(app)
    .post('/api/media')
    .set(authHeader(token))
    .field('media_type', 'video')
    .attach('file', PNG_1X1, 'clip.mp4')
    .expect(400);
  assert.equal(mismatch.body.error.code, 'INVALID_ASSET_FORMAT');

  // An unknown media type never reaches storage.
  await request(app)
    .post('/api/media')
    .set(authHeader(token))
    .field('media_type', 'audio')
    .attach('file', PNG_1X1, 'sound.mp3')
    .expect(400);
});

test('an oversized image is rejected with 413', async () => {
  const editor = await createUser({ role: 'editor' });
  const token = await login(editor);

  // Valid PNG header followed by padding, one byte over the 5 MB image limit.
  const oversized = Buffer.concat([
    PNG_1X1,
    Buffer.alloc(storageService.MEDIA_LIMITS.image + 1 - PNG_1X1.length, 0),
  ]);

  const res = await request(app)
    .post('/api/media')
    .set(authHeader(token))
    .field('media_type', 'image')
    .attach('file', oversized, 'big.png')
    .expect(413);
  assert.equal(res.body.error.code, 'ASSET_TOO_LARGE');
});

test('a rejected upload leaves nothing behind on the volume', async () => {
  const editor = await createUser({ role: 'editor' });
  const token = await login(editor);

  await request(app)
    .post('/api/media')
    .set(authHeader(token))
    .field('media_type', 'image')
    .attach('file', PDF_MINIMAL, 'disguised.png')
    .expect(400);

  const leftovers = await fsp.readdir(storageService.tmpRoot());
  assert.deepEqual(leftovers, [], 'temporary upload files must be cleaned up');
});

test('a missing file field is rejected before touching storage', async () => {
  const editor = await createUser({ role: 'editor' });
  const token = await login(editor);

  const res = await request(app)
    .post('/api/media')
    .set(authHeader(token))
    .field('media_type', 'image')
    .expect(400);
  assert.equal(res.body.error.code, 'FILE_REQUIRED');
});

test('deleting an uploaded media row removes its file from the volume', async () => {
  const editor = await createUser({ role: 'editor' });
  const token = await login(editor);

  const res = await request(app)
    .post('/api/media')
    .set(authHeader(token))
    .field('media_type', 'image')
    .attach('file', PNG_1X1, 'to-delete.png')
    .expect(201);

  const media = res.body.data;
  const filePath = uploadedPath(media);
  assert.equal(fs.existsSync(filePath), true);

  await request(app)
    .delete(`/api/media/${media.id}`)
    .set(authHeader(token))
    .expect(204);

  assert.equal(fs.existsSync(filePath), false);
  await request(app).get(media.file_url).expect(404);
});

test('admin can list all media', async () => {
  const admin = await createUser({ role: 'admin' });
  const editor = await createUser({ role: 'editor' });
  const adminToken = await login(admin);
  await createMedia(editor.id);

  const res = await request(app)
    .get('/api/media')
    .set(authHeader(adminToken))
    .expect(200);
  assert.ok(Array.isArray(res.body.data));
});

test('delete media referenced by cover returns 409', async () => {
  const admin = await createUser({ role: 'admin' });
  const editor = await createUser({ role: 'editor' });
  const adminToken = await login(admin);
  const editorToken = await login(editor);
  const categoryId = await createCategory(adminToken);

  const mediaId = await createMedia(editor.id);

  const postRes = await request(app)
    .post('/api/posts')
    .set(authHeader(editorToken))
    .send({
      title: `CoverRef ${Date.now()}`,
      content: { type: 'doc', content: [] },
      post_type: 'news',
      category_id: categoryId,
      cover_media_id: mediaId,
    })
    .expect(201);
  createdPostIds.add(postRes.body.data.id);

  await request(app)
    .delete(`/api/media/${mediaId}`)
    .set(authHeader(adminToken))
    .expect(409);
});

test('delete media referenced by post_media returns 409', async () => {
  const admin = await createUser({ role: 'admin' });
  const editor = await createUser({ role: 'editor' });
  const adminToken = await login(admin);
  const editorToken = await login(editor);
  const categoryId = await createCategory(adminToken);

  const mediaId = await createMedia(editor.id);

  const postRes = await request(app)
    .post('/api/posts')
    .set(authHeader(editorToken))
    .send({
      title: `InlineRef ${Date.now()}`,
      content: { type: 'doc', content: [{ type: 'image', attrs: { mediaId } }] },
      post_type: 'news',
      category_id: categoryId,
      media: [{ media_id: mediaId, usage_type: 'inline' }],
    })
    .expect(201);
  createdPostIds.add(postRes.body.data.id);

  await request(app)
    .delete(`/api/media/${mediaId}`)
    .set(authHeader(adminToken))
    .expect(409);
});

test('editor can delete own unreferenced media; cannot delete others', async () => {
  const editor1 = await createUser({ role: 'editor' });
  const editor2 = await createUser({ role: 'editor' });
  const t1 = await login(editor1);
  const t2 = await login(editor2);

  const mediaId = await createMedia(editor1.id);

  // other editor forbidden
  await request(app)
    .delete(`/api/media/${mediaId}`)
    .set(authHeader(t2))
    .expect(403);

  // owner can delete
  await request(app)
    .delete(`/api/media/${mediaId}`)
    .set(authHeader(t1))
    .expect(204);

  // remove from cleanup set since deleted
  createdMediaIds.delete(mediaId);
});

test('admin can delete any unreferenced media', async () => {
  const admin = await createUser({ role: 'admin' });
  const editor = await createUser({ role: 'editor' });
  const adminToken = await login(admin);

  const mediaId = await createMedia(editor.id);

  await request(app)
    .delete(`/api/media/${mediaId}`)
    .set(authHeader(adminToken))
    .expect(204);

  createdMediaIds.delete(mediaId);
});
