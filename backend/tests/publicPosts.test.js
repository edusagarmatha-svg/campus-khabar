const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const request = require('supertest');

const env = require('../src/config/env');
const db = require('../src/db/knex');
const app = require('../src/app');

if (env.db.database !== 'campus_kabar_test') {
  throw new Error(`Refusing to run public posts tests against database "${env.db.database}"`);
}
if (env.db.port !== 3308) {
  throw new Error(`Refusing to run public posts tests against port ${env.db.port}; expected 3308`);
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
    `public-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;

  const [id] = await db('users').insert({
    name: overrides.name || 'Public Test User',
    email,
    password_hash: passwordHash,
    role: overrides.role || 'editor',
    is_active: overrides.is_active === undefined ? true : overrides.is_active,
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
    file_url: overrides.file_url || 'https://example.com/cover.jpg',
    file_name: overrides.file_name || 'cover.jpg',
    mime_type: overrides.mime_type || 'image/jpeg',
    file_size: overrides.file_size === undefined ? 100 : overrides.file_size,
    alt_text: overrides.alt_text === undefined ? 'Cover alt' : overrides.alt_text,
    width: overrides.width === undefined ? 800 : overrides.width,
    height: overrides.height === undefined ? 600 : overrides.height,
    uploaded_by: uploadedBy || null,
  });
  createdMediaIds.add(id);
  return id;
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

test('public post list and detail include cover image metadata', async () => {
  const editor = await createUser({ role: 'editor' });
  const editorToken = await login(editor);
  const admin = await createUser({ role: 'admin' });
  const adminToken = await login(admin);

  const catRes = await request(app)
    .post('/api/categories')
    .set(authHeader(adminToken))
    .send({ name: `PubCat ${Date.now()}` })
    .expect(201);
  const categoryId = catRes.body.data.id;
  createdCategoryIds.add(categoryId);

  const mediaId = await createMedia(editor.id);

  // Editor drafts, then submits; only the admin approval publishes it.
  const draftRes = await request(app)
    .post('/api/posts')
    .set(authHeader(editorToken))
    .send({
      title: `Covered ${Date.now()}`,
      content: { type: 'doc', content: [] },
      post_type: 'news',
      category_id: categoryId,
      cover_media_id: mediaId,
    })
    .expect(201);
  createdPostIds.add(draftRes.body.data.id);

  await request(app)
    .post(`/api/posts/${draftRes.body.data.id}/submit-review`)
    .set(authHeader(editorToken))
    .expect(200);

  const postRes = await request(app)
    .post(`/api/posts/${draftRes.body.data.id}/approve`)
    .set(authHeader(adminToken))
    .expect(200);
  const post = postRes.body.data;
  createdPostIds.add(post.id);

  // list
  const listRes = await request(app).get('/api/posts').expect(200);
  const listed = listRes.body.data.find((p) => p.id === post.id);
  assert.ok(listed, 'post should be in public list');
  assert.ok(listed.cover_image, 'cover_image should be present');
  assert.equal(listed.cover_image.file_url, 'https://example.com/cover.jpg');
  assert.equal(listed.cover_image.alt_text, 'Cover alt');
  assert.equal(listed.cover_image.width, 800);
  assert.equal(listed.cover_image.height, 600);

  // detail
  const detailRes = await request(app).get(`/api/posts/${post.slug}`).expect(200);
  const detail = detailRes.body.data;
  assert.ok(detail.cover_image, 'cover_image should be present in detail');
  assert.equal(detail.cover_image.file_url, 'https://example.com/cover.jpg');
  assert.equal(detail.cover_media_id, mediaId);
});

test('public post without cover has null cover_image', async () => {
  const editor = await createUser({ role: 'editor' });
  const editorToken = await login(editor);
  const admin = await createUser({ role: 'admin' });
  const adminToken = await login(admin);

  const catRes = await request(app)
    .post('/api/categories')
    .set(authHeader(adminToken))
    .send({ name: `NoCover ${Date.now()}` })
    .expect(201);
  const categoryId = catRes.body.data.id;
  createdCategoryIds.add(categoryId);

  const draftRes = await request(app)
    .post('/api/posts')
    .set(authHeader(editorToken))
    .send({
      title: `NoCover ${Date.now()}`,
      content: { type: 'doc', content: [] },
      post_type: 'news',
      category_id: categoryId,
    })
    .expect(201);
  createdPostIds.add(draftRes.body.data.id);

  await request(app)
    .post(`/api/posts/${draftRes.body.data.id}/submit-review`)
    .set(authHeader(editorToken))
    .expect(200);

  const postRes = await request(app)
    .post(`/api/posts/${draftRes.body.data.id}/approve`)
    .set(authHeader(adminToken))
    .expect(200);
  const post = postRes.body.data;
  createdPostIds.add(post.id);

  const detailRes = await request(app).get(`/api/posts/${post.slug}`).expect(200);
  assert.equal(detailRes.body.data.cover_image, null);
});
