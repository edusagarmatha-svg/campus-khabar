const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const request = require('supertest');

const env = require('../src/config/env');
const db = require('../src/db/knex');
const app = require('../src/app');

if (env.db.database !== 'campus_kabar_test') {
  throw new Error(`Refusing to run content tests against database "${env.db.database}"`);
}
if (env.db.port !== 3308) {
  throw new Error(`Refusing to run content tests against port ${env.db.port}; expected 3308`);
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
    `content-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;

  const [id] = await db('users').insert({
    name: overrides.name || 'Content Test User',
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

async function createCategory(payload, token) {
  const res = await request(app)
    .post('/api/categories')
    .set('Authorization', `Bearer ${token}`)
    .send(payload)
    .expect(201);
  createdCategoryIds.add(res.body.data.id);
  return res.body.data;
}

async function createMedia(uploadedBy) {
  const [id] = await db('media').insert({
    media_type: 'image',
    source_type: 'external',
    storage_provider: 'external',
    storage_key: `test/${Date.now()}/${Math.random()}`,
    file_url: 'https://example.com/x.jpg',
    file_name: 'x.jpg',
    mime_type: 'image/jpeg',
    uploaded_by: uploadedBy || null,
  });
  createdMediaIds.add(id);
  return id;
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
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

test('admin can create and list categories; editor forbidden', async () => {
  const admin = await createUser({ role: 'admin' });
  const editor = await createUser({ role: 'editor' });
  const adminToken = await login(admin);
  const editorToken = await login(editor);

  const cat = await createCategory({ name: `Cat ${Date.now()}`, description: 'desc' }, adminToken);
  assert.ok(cat.id);
  assert.equal(cat.is_active, true);

  await request(app)
    .post('/api/categories')
    .set(authHeader(editorToken))
    .send({ name: 'Nope' })
    .expect(403);

  const listRes = await request(app).get('/api/categories').expect(200);
  assert.ok(Array.isArray(listRes.body.data));
  assert.ok(listRes.body.data.some((c) => c.id === cat.id));
});

test('category delete in use returns 409', async () => {
  const admin = await createUser({ role: 'admin' });
  const editor = await createUser({ role: 'editor' });
  const adminToken = await login(admin);
  const editorToken = await login(editor);

  const cat = await createCategory({ name: `InUse ${Date.now()}` }, adminToken);

  const postRes = await request(app)
    .post('/api/posts')
    .set(authHeader(editorToken))
    .send({
      title: `Post ${Date.now()}`,
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }] },
      post_type: 'news',
      category_id: cat.id,
    })
    .expect(201);
  createdPostIds.add(postRes.body.data.id);

  await request(app)
    .delete(`/api/categories/${cat.id}`)
    .set(authHeader(adminToken))
    .expect(409);
});

test('editor creates draft; not public; managed list shows it', async () => {
  const editor = await createUser({ role: 'editor' });
  const editorToken = await login(editor);

  const admin = await createUser({ role: 'admin' });
  const adminToken = await login(admin);
  const cat = await createCategory({ name: `DraftCat ${Date.now()}` }, adminToken);

  const postRes = await request(app)
    .post('/api/posts')
    .set(authHeader(editorToken))
    .send({
      title: `Draft ${Date.now()}`,
      content: { type: 'doc', content: [] },
      post_type: 'news',
      category_id: cat.id,
    })
    .expect(201);
  const post = postRes.body.data;
  createdPostIds.add(post.id);
  assert.equal(post.status, 'draft');
  assert.equal(post.author_id, editor.id);

  // not in public list
  const publicRes = await request(app).get('/api/posts').expect(200);
  assert.ok(!publicRes.body.data.some((p) => p.id === post.id));

  // managed list
  const managedRes = await request(app)
    .get('/api/posts/manage/list')
    .set(authHeader(editorToken))
    .expect(200);
  assert.ok(managedRes.body.data.some((p) => p.id === post.id));
});

test('publish makes post public; unpublish removes', async () => {
  const editor = await createUser({ role: 'editor' });
  const editorToken = await login(editor);
  const admin = await createUser({ role: 'admin' });
  const adminToken = await login(admin);
  const cat = await createCategory({ name: `PubCat ${Date.now()}` }, adminToken);

  const postRes = await request(app)
    .post('/api/posts')
    .set(authHeader(editorToken))
    .send({
      title: `Publish ${Date.now()}`,
      content: { type: 'doc', content: [] },
      post_type: 'news',
      category_id: cat.id,
    })
    .expect(201);
  const postId = postRes.body.data.id;
  createdPostIds.add(postId);

  // publish via PATCH status
  const pubRes = await request(app)
    .patch(`/api/posts/${postId}`)
    .set(authHeader(editorToken))
    .send({ status: 'published' })
    .expect(200);
  assert.equal(pubRes.body.data.status, 'published');
  assert.ok(pubRes.body.data.published_at);

  // public visible
  const slug = pubRes.body.data.slug;
  const detailRes = await request(app).get(`/api/posts/${slug}`).expect(200);
  assert.equal(detailRes.body.data.id, postId);

  // unpublish
  await request(app)
    .patch(`/api/posts/${postId}`)
    .set(authHeader(editorToken))
    .send({ status: 'unpublished' })
    .expect(200);

  await request(app).get(`/api/posts/${slug}`).expect(404);
});

test('slug uniqueness appends suffix', async () => {
  const editor = await createUser({ role: 'editor' });
  const editorToken = await login(editor);
  const admin = await createUser({ role: 'admin' });
  const adminToken = await login(admin);
  const cat = await createCategory({ name: `SlugCat ${Date.now()}` }, adminToken);

  const title = `Same Title ${Date.now()}`;
  const r1 = await request(app)
    .post('/api/posts')
    .set(authHeader(editorToken))
    .send({ title, content: { type: 'doc', content: [] }, post_type: 'news', category_id: cat.id })
    .expect(201);
  createdPostIds.add(r1.body.data.id);

  const r2 = await request(app)
    .post('/api/posts')
    .set(authHeader(editorToken))
    .send({ title, content: { type: 'doc', content: [] }, post_type: 'news', category_id: cat.id })
    .expect(201);
  createdPostIds.add(r2.body.data.id);

  assert.notEqual(r1.body.data.slug, r2.body.data.slug);
});

test('soft delete rewrites slug and removes from public', async () => {
  const editor = await createUser({ role: 'editor' });
  const editorToken = await login(editor);
  const admin = await createUser({ role: 'admin' });
  const adminToken = await login(admin);
  const cat = await createCategory({ name: `DelCat ${Date.now()}` }, adminToken);

  const postRes = await request(app)
    .post('/api/posts')
    .set(authHeader(editorToken))
    .send({
      title: `ToDelete ${Date.now()}`,
      content: { type: 'doc', content: [] },
      post_type: 'news',
      category_id: cat.id,
      status: 'published',
    })
    .expect(201);
  const post = postRes.body.data;
  createdPostIds.add(post.id);

  const originalSlug = post.slug;

  const delRes = await request(app)
    .delete(`/api/posts/${post.id}`)
    .set(authHeader(editorToken))
    .expect(200);
  assert.ok(delRes.body.data.deleted_at);
  assert.notEqual(delRes.body.data.slug, originalSlug);
  assert.match(delRes.body.data.slug, /--deleted-/);

  await request(app).get(`/api/posts/${originalSlug}`).expect(404);
});

test('editor cannot edit another editors post', async () => {
  const editor1 = await createUser({ role: 'editor' });
  const editor2 = await createUser({ role: 'editor' });
  const t1 = await login(editor1);
  const t2 = await login(editor2);
  const admin = await createUser({ role: 'admin' });
  const adminToken = await login(admin);
  const cat = await createCategory({ name: `PermCat ${Date.now()}` }, adminToken);

  const postRes = await request(app)
    .post('/api/posts')
    .set(authHeader(t1))
    .send({ title: `Owned ${Date.now()}`, content: { type: 'doc', content: [] }, post_type: 'news', category_id: cat.id })
    .expect(201);
  const postId = postRes.body.data.id;
  createdPostIds.add(postId);

  await request(app)
    .patch(`/api/posts/${postId}`)
    .set(authHeader(t2))
    .send({ title: 'Hacked' })
    .expect(403);

  // admin can edit
  await request(app)
    .patch(`/api/posts/${postId}`)
    .set(authHeader(adminToken))
    .send({ title: 'Admin Edited' })
    .expect(200);
});

test('validation errors return 400', async () => {
  const editor = await createUser({ role: 'editor' });
  const editorToken = await login(editor);
  const admin = await createUser({ role: 'admin' });
  const adminToken = await login(admin);
  const cat = await createCategory({ name: `ValCat ${Date.now()}` }, adminToken);

  await request(app)
    .post('/api/posts')
    .set(authHeader(editorToken))
    .send({ title: '', content: { type: 'doc', content: [] }, post_type: 'news', category_id: cat.id })
    .expect(400);

  await request(app)
    .post('/api/posts')
    .set(authHeader(editorToken))
    .send({ title: 'X', content: 'not-object', post_type: 'news', category_id: cat.id })
    .expect(400);

  await request(app)
    .post('/api/posts')
    .set(authHeader(editorToken))
    .send({ title: 'X', content: { type: 'doc', content: [] }, post_type: 'invalid', category_id: cat.id })
    .expect(400);
});

test('expired post excluded from public list', async () => {
  const editor = await createUser({ role: 'editor' });
  const editorToken = await login(editor);
  const admin = await createUser({ role: 'admin' });
  const adminToken = await login(admin);
  const cat = await createCategory({ name: `ExpCat ${Date.now()}` }, adminToken);

  const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const pubAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const postRes = await request(app)
    .post('/api/posts')
    .set(authHeader(editorToken))
    .send({
      title: `Expired ${Date.now()}`,
      content: { type: 'doc', content: [] },
      post_type: 'news',
      category_id: cat.id,
      status: 'published',
      published_at: pubAt,
      expires_at: past,
    })
    .expect(201);
  const post = postRes.body.data;
  createdPostIds.add(post.id);

  const publicRes = await request(app).get('/api/posts').expect(200);
  assert.ok(!publicRes.body.data.some((p) => p.id === post.id));
});

test('content media references require linked media', async () => {
  const editor = await createUser({ role: 'editor' });
  const editorToken = await login(editor);
  const admin = await createUser({ role: 'admin' });
  const adminToken = await login(admin);
  const cat = await createCategory({ name: `MediaCat ${Date.now()}` }, adminToken);
  const mediaId = await createMedia(editor.id);

  // missing link -> 400
  await request(app)
    .post('/api/posts')
    .set(authHeader(editorToken))
    .send({
      title: `Media ${Date.now()}`,
      content: { type: 'doc', content: [{ type: 'image', attrs: { mediaId } }] },
      post_type: 'news',
      category_id: cat.id,
    })
    .expect(400);

  // linked -> 201
  const okRes = await request(app)
    .post('/api/posts')
    .set(authHeader(editorToken))
    .send({
      title: `MediaOk ${Date.now()}`,
      content: { type: 'doc', content: [{ type: 'image', attrs: { mediaId } }] },
      post_type: 'news',
      category_id: cat.id,
      media: [{ media_id: mediaId, usage_type: 'inline' }],
    })
    .expect(201);
  createdPostIds.add(okRes.body.data.id);
});
