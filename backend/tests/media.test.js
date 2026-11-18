const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const request = require('supertest');

const env = require('../src/config/env');
const db = require('../src/db/knex');
const app = require('../src/app');

if (env.db.database !== 'campus_kabar_test') {
  throw new Error(`Refusing to run media tests against database "${env.db.database}"`);
}
if (env.db.port !== 3308) {
  throw new Error(`Refusing to run media tests against port ${env.db.port}; expected 3308`);
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
});

test('unauthenticated media requests are rejected', async () => {
  await request(app).get('/api/media').expect(401);
  await request(app).get('/api/media/1').expect(401);
  await request(app).post('/api/media/signature').send({ media_type: 'image' }).expect(401);
  await request(app).post('/api/media').send({ media_type: 'image', public_id: 'x' }).expect(401);
  await request(app).delete('/api/media/1').expect(401);
});

test('editor can list own media; signature/register unavailable without Cloudinary', async () => {
  const editor = await createUser({ role: 'editor' });
  const token = await login(editor);

  const mediaId = await createMedia(editor.id);
  const listRes = await request(app)
    .get('/api/media')
    .set(authHeader(token))
    .expect(200);
  assert.ok(listRes.body.data.some((m) => m.id === mediaId));

  // Cloudinary not configured in test env
  await request(app)
    .post('/api/media/signature')
    .set(authHeader(token))
    .send({ media_type: 'image' })
    .expect(503);

  await request(app)
    .post('/api/media')
    .set(authHeader(token))
    .send({ media_type: 'image', public_id: 'some/public/id' })
    .expect(503);
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
