const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const request = require('supertest');

const env = require('../src/config/env');
const db = require('../src/db/knex');
const app = require('../src/app');

if (env.db.database !== 'campus_kabar_test') {
  throw new Error(`Refusing to run video tests against database "${env.db.database}"`);
}
if (env.db.port !== 3308) {
  throw new Error(`Refusing to run video tests against port ${env.db.port}; expected 3308`);
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
    `video-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;

  const [id] = await db('users').insert({
    name: overrides.name || 'Video Test User',
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

async function createCategory(token) {
  const res = await request(app)
    .post('/api/categories')
    .set(authHeader(token))
    .send({ name: `VideoCat ${Date.now()}-${Math.random().toString(16).slice(2)}` })
    .expect(201);
  createdCategoryIds.add(res.body.data.id);
  return res.body.data.id;
}

async function createMedia(uploadedBy, overrides = {}) {
  const [id] = await db('media').insert({
    media_type: overrides.media_type || 'video',
    source_type: overrides.source_type || 'external',
    storage_provider: overrides.storage_provider || 'external',
    storage_key: overrides.storage_key || `video/${Date.now()}/${Math.random()}`,
    file_url: overrides.file_url || 'https://example.com/video.mp4',
    file_name: overrides.file_name || 'video.mp4',
    mime_type: overrides.mime_type || 'video/mp4',
    file_size: overrides.file_size === undefined ? 1000 : overrides.file_size,
    alt_text: overrides.alt_text === undefined ? 'Video alt' : overrides.alt_text,
    width: overrides.width === undefined ? 640 : overrides.width,
    height: overrides.height === undefined ? 360 : overrides.height,
    duration_seconds: overrides.duration_seconds === undefined ? 12.5 : overrides.duration_seconds,
    uploaded_by: uploadedBy || null,
  });
  createdMediaIds.add(id);
  return id;
}

test.after(async () => {
  if (createdPostIds.size > 0) {
    const ids = [...createdPostIds];
    await db('post_revisions').whereIn('post_id', ids).delete();
    await db('post_media').whereIn('post_id', ids).delete();
    await db('post_revision_media').whereIn('revision_id', db('post_revisions').select('id').whereIn('post_id', ids)).delete();
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

test('video upload configuration rejects unknown media types', async () => {
  const editor = await createUser({ role: 'editor' });
  const token = await login(editor);

  await request(app)
    .post('/api/media/signature')
    .set(authHeader(token))
    .send({ media_type: 'audio' })
    .expect(400);

  await request(app)
    .post('/api/media')
    .set(authHeader(token))
    .send({ media_type: 'video', public_id: 'some/public/id' })
    .expect(503);
});

test('inline video requires linked media', async () => {
  const editor = await createUser({ role: 'editor' });
  const editorToken = await login(editor);
  const admin = await createUser({ role: 'admin' });
  const adminToken = await login(admin);
  const categoryId = await createCategory(adminToken);

  const mediaId = await createMedia(editor.id);

  // missing link -> 400
  await request(app)
    .post('/api/posts')
    .set(authHeader(editorToken))
    .send({
      title: `InlineVideo ${Date.now()}`,
      content: { type: 'doc', content: [{ type: 'video', attrs: { mediaId, src: 'https://example.com/video.mp4' } }] },
      post_type: 'news',
      category_id: categoryId,
    })
    .expect(400);

  // linked -> 201
  const okRes = await request(app)
    .post('/api/posts')
    .set(authHeader(editorToken))
    .send({
      title: `InlineVideoOk ${Date.now()}`,
      content: { type: 'doc', content: [{ type: 'video', attrs: { mediaId, src: 'https://example.com/video.mp4' } }] },
      post_type: 'news',
      category_id: categoryId,
      media: [{ media_id: mediaId, usage_type: 'inline' }],
    })
    .expect(201);
  createdPostIds.add(okRes.body.data.id);

  const managed = await request(app)
    .get(`/api/posts/manage/${okRes.body.data.id}`)
    .set(authHeader(editorToken))
    .expect(200);
  assert.ok(managed.body.data.media.some((m) => Number(m.media_id) === mediaId && m.usage_type === 'inline'));
});

test('attachments are exposed in public post detail', async () => {
  const editor = await createUser({ role: 'editor' });
  const editorToken = await login(editor);
  const admin = await createUser({ role: 'admin' });
  const adminToken = await login(admin);
  const categoryId = await createCategory(adminToken);

  const videoId = await createMedia(editor.id);
  const imageId = await createMedia(editor.id, {
    media_type: 'image',
    mime_type: 'image/jpeg',
    file_url: 'https://example.com/att.jpg',
    file_name: 'att.jpg',
  });

  const draftRes = await request(app)
    .post('/api/posts')
    .set(authHeader(editorToken))
    .send({
      title: `Attachments ${Date.now()}`,
      content: { type: 'doc', content: [] },
      post_type: 'news',
      category_id: categoryId,
      media: [
        { media_id: videoId, usage_type: 'attachment', sort_order: 0 },
        { media_id: imageId, usage_type: 'attachment', sort_order: 1 },
      ],
    })
    .expect(201);
  createdPostIds.add(draftRes.body.data.id);

  await request(app)
    .post(`/api/posts/${draftRes.body.data.id}/submit-review`)
    .set(authHeader(editorToken))
    .expect(200);
  const approved = await request(app)
    .post(`/api/posts/${draftRes.body.data.id}/approve`)
    .set(authHeader(adminToken))
    .expect(200);
  const post = approved.body.data;
  createdPostIds.add(post.id);

  const detailRes = await request(app)
    .get(`/api/posts/${post.slug}`)
    .expect(200);
  const detail = detailRes.body.data;
  assert.ok(Array.isArray(detail.attachments));
  assert.equal(detail.attachments.length, 2);
  assert.ok(detail.attachments.some((m) => m.id === videoId && m.media_type === 'video'));
  assert.ok(detail.attachments.some((m) => m.id === imageId && m.media_type === 'image'));
});

test('revision preserves inline video and attachments through approval', async () => {
  const editor = await createUser({ role: 'editor' });
  const editorToken = await login(editor);
  const admin = await createUser({ role: 'admin' });
  const adminToken = await login(admin);
  const categoryId = await createCategory(adminToken);

  const firstMedia = await createMedia(editor.id);
  const secondMedia = await createMedia(editor.id);

  const published = await request(app)
    .post('/api/posts')
    .set(authHeader(editorToken))
    .send({
      title: `Published ${Date.now()}`,
      content: { type: 'doc', content: [{ type: 'video', attrs: { mediaId: firstMedia, src: 'https://example.com/v1.mp4' } }] },
      post_type: 'news',
      category_id: categoryId,
      media: [{ media_id: firstMedia, usage_type: 'inline' }],
    })
    .expect(201);
  createdPostIds.add(published.body.data.id);

  await request(app)
    .post(`/api/posts/${published.body.data.id}/submit-review`)
    .set(authHeader(editorToken))
    .expect(200);
  const approvedPub = await request(app)
    .post(`/api/posts/${published.body.data.id}/approve`)
    .set(authHeader(adminToken))
    .expect(200);
  const postId = approvedPub.body.data.id;

  const proposedContent = {
    type: 'doc',
    content: [{ type: 'video', attrs: { mediaId: secondMedia, src: 'https://example.com/v2.mp4' } }],
  };

  const revisionRes = await request(app)
    .post(`/api/posts/${postId}/revisions`)
    .set(authHeader(editorToken))
    .send({
      content: proposedContent,
      media: [{ media_id: secondMedia, usage_type: 'inline' }],
    })
    .expect(201);
  const revisionId = revisionRes.body.data.id;

  const applied = await request(app)
    .post(`/api/post-revisions/${revisionId}/approve`)
    .set(authHeader(adminToken))
    .expect(200);
  assert.deepEqual(applied.body.data.content, proposedContent);

  const afterLinks = await db('post_media').where({ post_id: postId }).select('media_id', 'usage_type');
  assert.deepEqual(
    afterLinks.map((r) => ({ media_id: Number(r.media_id), usage_type: r.usage_type })),
    [{ media_id: secondMedia, usage_type: 'inline' }],
  );
});

test('managed post exposes media links and attachments', async () => {
  const editor = await createUser({ role: 'editor' });
  const editorToken = await login(editor);
  const admin = await createUser({ role: 'admin' });
  const adminToken = await login(admin);
  const categoryId = await createCategory(adminToken);

  const mediaId = await createMedia(editor.id);

  const postRes = await request(app)
    .post('/api/posts')
    .set(authHeader(editorToken))
    .send({
      title: `Managed ${Date.now()}`,
      content: { type: 'doc', content: [] },
      post_type: 'news',
      category_id: categoryId,
      media: [{ media_id: mediaId, usage_type: 'attachment' }],
    })
    .expect(201);
  createdPostIds.add(postRes.body.data.id);

  const managed = await request(app)
    .get(`/api/posts/manage/${postRes.body.data.id}`)
    .set(authHeader(editorToken))
    .expect(200);
  assert.ok(Array.isArray(managed.body.data.media));
  assert.ok(managed.body.data.media.some((m) => Number(m.media_id) === mediaId));
  assert.ok(Array.isArray(managed.body.data.attachments));
  assert.ok(managed.body.data.attachments.some((m) => m.id === mediaId));
});
