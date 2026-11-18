const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const request = require('supertest');

const env = require('../src/config/env');
const db = require('../src/db/knex');
const app = require('../src/app');

if (env.db.database !== 'campus_kabar_test') {
  throw new Error(`Refusing to run review workflow tests against database "${env.db.database}"`);
}
if (env.db.port !== 3308) {
  throw new Error(`Refusing to run review workflow tests against port ${env.db.port}; expected 3308`);
}

const createdUserIds = new Set();
const createdCategoryIds = new Set();
const createdPostIds = new Set();
const createdMediaIds = new Set();

const DOC = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'body' }] }] };

async function createUser(overrides = {}) {
  const password = overrides.password || 'test-password-1234';
  const passwordHash = await bcrypt.hash(password, 4);
  const email =
    overrides.email ||
    `workflow-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;

  const [id] = await db('users').insert({
    name: overrides.name || 'Workflow Test User',
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

async function createCategory(token) {
  const res = await request(app)
    .post('/api/categories')
    .set(authHeader(token))
    .send({ name: `WorkflowCat ${Date.now()}-${Math.random().toString(16).slice(2)}` })
    .expect(201);
  createdCategoryIds.add(res.body.data.id);
  return res.body.data;
}

async function createMedia(uploadedBy) {
  const [id] = await db('media').insert({
    media_type: 'image',
    source_type: 'external',
    storage_provider: 'external',
    storage_key: `workflow/${Date.now()}/${Math.random()}`,
    file_url: 'https://example.com/workflow.jpg',
    file_name: 'workflow.jpg',
    mime_type: 'image/jpeg',
    file_size: 128,
    uploaded_by: uploadedBy || null,
  });
  createdMediaIds.add(id);
  return id;
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

async function createDraft(token, categoryId, extra = {}) {
  const res = await request(app)
    .post('/api/posts')
    .set(authHeader(token))
    .send({
      title: `Draft ${Date.now()}-${Math.random().toString(16).slice(2)}`,
      content: DOC,
      post_type: 'news',
      category_id: categoryId,
      ...extra,
    })
    .expect(201);
  createdPostIds.add(res.body.data.id);
  return res.body.data;
}

async function createPublishedPost(editorToken, adminToken, categoryId, extra = {}) {
  const draft = await createDraft(editorToken, categoryId, extra);
  await request(app)
    .post(`/api/posts/${draft.id}/submit-review`)
    .set(authHeader(editorToken))
    .expect(200);
  const approved = await request(app)
    .post(`/api/posts/${draft.id}/approve`)
    .set(authHeader(adminToken))
    .expect(200);
  return approved.body.data;
}

async function setupStaff() {
  const editor = await createUser({ role: 'editor' });
  const editorToken = await login(editor);
  const admin = await createUser({ role: 'admin' });
  const adminToken = await login(admin);
  const category = await createCategory(adminToken);
  return { editor, editorToken, admin, adminToken, category };
}

test.after(async () => {
  if (createdPostIds.size > 0) {
    const ids = [...createdPostIds];
    // Revision media rows cascade with their revision.
    await db('post_revisions').whereIn('post_id', ids).delete();
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

test('editor cannot create or patch a post to published', async () => {
  const { editorToken, adminToken, category } = await setupStaff();

  await request(app)
    .post('/api/posts')
    .set(authHeader(editorToken))
    .send({
      title: 'Editor published attempt',
      content: DOC,
      post_type: 'news',
      category_id: category.id,
      status: 'published',
    })
    .expect(403);

  const draft = await createDraft(editorToken, category.id);

  for (const status of ['published', 'unpublished', 'pending_review']) {
    await request(app)
      .patch(`/api/posts/${draft.id}`)
      .set(authHeader(editorToken))
      .send({ status })
      .expect(403);
  }

  // The admin may publish directly.
  const promoted = await request(app)
    .patch(`/api/posts/${draft.id}`)
    .set(authHeader(adminToken))
    .send({ status: 'published' })
    .expect(200);
  assert.equal(promoted.body.data.status, 'published');
  assert.ok(promoted.body.data.published_at);
});

test('submission stays invisible until an admin approves it', async () => {
  const { editorToken, adminToken, category } = await setupStaff();
  const draft = await createDraft(editorToken, category.id);

  const submitted = await request(app)
    .post(`/api/posts/${draft.id}/submit-review`)
    .set(authHeader(editorToken))
    .expect(200);
  assert.equal(submitted.body.data.status, 'pending_review');
  assert.ok(submitted.body.data.submitted_at);

  // Not in the public list, not reachable by slug.
  const list = await request(app).get('/api/posts').expect(200);
  assert.ok(!list.body.data.some((p) => p.id === draft.id));
  await request(app).get(`/api/posts/${draft.slug}`).expect(404);

  const approved = await request(app)
    .post(`/api/posts/${draft.id}/approve`)
    .set(authHeader(adminToken))
    .expect(200);
  assert.equal(approved.body.data.status, 'published');
  assert.ok(approved.body.data.reviewed_at);
  assert.equal(approved.body.data.reviewed_by, (await whoIs(adminToken)).id);

  const detail = await request(app).get(`/api/posts/${draft.slug}`).expect(200);
  assert.equal(detail.body.data.id, draft.id);
});

async function whoIs(token) {
  const res = await request(app).get('/api/auth/me').set(authHeader(token)).expect(200);
  return res.body.user;
}

test('requesting changes keeps content intact and lets the editor resubmit', async () => {
  const { editorToken, adminToken, category } = await setupStaff();
  const draft = await createDraft(editorToken, category.id, { summary: 'Original summary' });
  await request(app)
    .post(`/api/posts/${draft.id}/submit-review`)
    .set(authHeader(editorToken))
    .expect(200);

  // Feedback is required.
  await request(app)
    .post(`/api/posts/${draft.id}/request-changes`)
    .set(authHeader(adminToken))
    .send({})
    .expect(400);

  const returned = await request(app)
    .post(`/api/posts/${draft.id}/request-changes`)
    .set(authHeader(adminToken))
    .send({ feedback: 'Please add a source for the numbers' })
    .expect(200);
  assert.equal(returned.body.data.status, 'changes_requested');
  assert.equal(returned.body.data.review_feedback, 'Please add a source for the numbers');
  assert.equal(returned.body.data.title, draft.title);
  assert.equal(returned.body.data.summary, 'Original summary');
  assert.equal(returned.body.data.slug, draft.slug);
  assert.ok(returned.body.data.published_at === null || returned.body.data.published_at === undefined);

  // Still invisible to the public.
  await request(app).get(`/api/posts/${draft.slug}`).expect(404);

  // The owner can see the feedback and edit the returned submission.
  const managed = await request(app)
    .get(`/api/posts/manage/${draft.id}`)
    .set(authHeader(editorToken))
    .expect(200);
  assert.equal(managed.body.data.review_feedback, 'Please add a source for the numbers');

  const edited = await request(app)
    .patch(`/api/posts/${draft.id}`)
    .set(authHeader(editorToken))
    .send({ summary: 'Summary with source', content: DOC })
    .expect(200);
  assert.equal(edited.body.data.summary, 'Summary with source');

  const resubmitted = await request(app)
    .post(`/api/posts/${draft.id}/submit-review`)
    .set(authHeader(editorToken))
    .expect(200);
  assert.equal(resubmitted.body.data.status, 'pending_review');
  assert.equal(resubmitted.body.data.review_feedback, null);

  const approved = await request(app)
    .post(`/api/posts/${draft.id}/approve`)
    .set(authHeader(adminToken))
    .expect(200);
  assert.equal(approved.body.data.status, 'published');
  assert.equal(approved.body.data.summary, 'Summary with source');
});

test('editor cannot edit a post awaiting review, nor review it', async () => {
  const { editorToken, adminToken, category } = await setupStaff();
  const draft = await createDraft(editorToken, category.id);
  await request(app)
    .post(`/api/posts/${draft.id}/submit-review`)
    .set(authHeader(editorToken))
    .expect(200);

  await request(app)
    .patch(`/api/posts/${draft.id}`)
    .set(authHeader(editorToken))
    .send({ title: 'Sneaky edit' })
    .expect(409);

  // Editor can neither approve nor request changes (backend-enforced).
  await request(app)
    .post(`/api/posts/${draft.id}/approve`)
    .set(authHeader(editorToken))
    .expect(403);
  await request(app)
    .post(`/api/posts/${draft.id}/request-changes`)
    .set(authHeader(editorToken))
    .send({ feedback: 'nope' })
    .expect(403);

  // Editor cannot reach the admin review queue either.
  await request(app)
    .get('/api/posts/review-queue')
    .set(authHeader(editorToken))
    .expect(403);

  // Admin queue lists the pending submission.
  const queue = await request(app)
    .get('/api/posts/review-queue')
    .set(authHeader(adminToken))
    .expect(200);
  const item = queue.body.data.find((i) => i.item_type === 'post' && i.id === draft.id);
  assert.ok(item, 'pending post should appear in the queue');
  assert.equal(item.status, 'pending_review');
});

test('published post stays live and unchanged while a revision is pending', async () => {
  const { editorToken, adminToken, category } = await setupStaff();
  const published = await createPublishedPost(editorToken, adminToken, category.id, {
    summary: 'Live summary',
  });

  const proposedContent = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'proposed body' }] }],
  };

  const revisionRes = await request(app)
    .post(`/api/posts/${published.id}/revisions`)
    .set(authHeader(editorToken))
    .send({
      title: 'Proposed title',
      summary: 'Proposed summary',
      content: proposedContent,
      category_id: category.id,
    })
    .expect(201);
  const revision = revisionRes.body.data;
  assert.equal(revision.status, 'pending_review');
  assert.equal(revision.post_id, published.id);

  // Public content unchanged while the revision awaits review.
  const live = await request(app).get(`/api/posts/${published.slug}`).expect(200);
  assert.equal(live.body.data.title, published.title);
  assert.equal(live.body.data.summary, 'Live summary');

  // A second open revision is refused.
  await request(app)
    .post(`/api/posts/${published.id}/revisions`)
    .set(authHeader(editorToken))
    .send({ title: 'Second proposal' })
    .expect(409);

  const applied = await request(app)
    .post(`/api/post-revisions/${revision.id}/approve`)
    .set(authHeader(adminToken))
    .expect(200);
  assert.equal(applied.body.data.title, 'Proposed title');
  assert.equal(applied.body.data.summary, 'Proposed summary');
  assert.equal(applied.body.data.status, 'published');
  assert.deepEqual(applied.body.data.content, proposedContent);

  const after = await request(app).get(`/api/posts/${published.slug}`).expect(200);
  assert.equal(after.body.data.title, 'Proposed title');
});

test('revision changes requested: post untouched, editor edits and resubmits', async () => {
  const { editorToken, adminToken, category } = await setupStaff();
  const published = await createPublishedPost(editorToken, adminToken, category.id);

  const revisionRes = await request(app)
    .post(`/api/posts/${published.id}/revisions`)
    .set(authHeader(editorToken))
    .send({ title: 'First proposal' })
    .expect(201);
  const revisionId = revisionRes.body.data.id;

  // Editor cannot edit a pending revision.
  await request(app)
    .patch(`/api/post-revisions/${revisionId}`)
    .set(authHeader(editorToken))
    .send({ title: 'Too early' })
    .expect(409);

  const returned = await request(app)
    .post(`/api/post-revisions/${revisionId}/request-changes`)
    .set(authHeader(adminToken))
    .send({ feedback: 'Tighten the headline' })
    .expect(200);
  assert.equal(returned.body.data.status, 'changes_requested');
  assert.equal(returned.body.data.review_feedback, 'Tighten the headline');

  // Published version still public with its original title.
  const live = await request(app).get(`/api/posts/${published.slug}`).expect(200);
  assert.equal(live.body.data.title, published.title);

  const edited = await request(app)
    .patch(`/api/post-revisions/${revisionId}`)
    .set(authHeader(editorToken))
    .send({ title: 'Tightened headline' })
    .expect(200);
  assert.equal(edited.body.data.title, 'Tightened headline');

  const resubmitted = await request(app)
    .post(`/api/post-revisions/${revisionId}/submit-review`)
    .set(authHeader(editorToken))
    .expect(200);
  assert.equal(resubmitted.body.data.status, 'pending_review');

  const applied = await request(app)
    .post(`/api/post-revisions/${revisionId}/approve`)
    .set(authHeader(adminToken))
    .expect(200);
  assert.equal(applied.body.data.title, 'Tightened headline');

  const revision = await request(app)
    .get(`/api/post-revisions/${revisionId}`)
    .set(authHeader(adminToken))
    .expect(200);
  assert.equal(revision.body.data.status, 'applied');
});

test('approving a revision applies its media relationships atomically', async () => {
  const { editor, editorToken, adminToken, category } = await setupStaff();
  const firstMedia = await createMedia(editor.id);
  const secondMedia = await createMedia(editor.id);

  const published = await createPublishedPost(editorToken, adminToken, category.id, {
    content: { type: 'doc', content: [{ type: 'image', attrs: { mediaId: firstMedia } }] },
    media: [{ media_id: firstMedia, usage_type: 'inline' }],
  });

  const proposedContent = {
    type: 'doc',
    content: [{ type: 'image', attrs: { mediaId: secondMedia } }],
  };

  const revisionRes = await request(app)
    .post(`/api/posts/${published.id}/revisions`)
    .set(authHeader(editorToken))
    .send({
      content: proposedContent,
      media: [{ media_id: secondMedia, usage_type: 'inline' }],
      cover_media_id: secondMedia,
    })
    .expect(201);

  // Media referenced only by a pending revision is protected from deletion.
  await request(app)
    .delete(`/api/media/${secondMedia}`)
    .set(authHeader(editorToken))
    .expect(409);

  // The published post still points at its original media.
  const beforeLinks = await db('post_media').where({ post_id: published.id }).select('media_id');
  assert.deepEqual(
    beforeLinks.map((r) => Number(r.media_id)),
    [firstMedia],
  );

  const applied = await request(app)
    .post(`/api/post-revisions/${revisionRes.body.data.id}/approve`)
    .set(authHeader(adminToken))
    .expect(200);
  assert.equal(applied.body.data.cover_media_id, secondMedia);

  const afterLinks = await db('post_media').where({ post_id: published.id }).select('media_id');
  assert.deepEqual(
    afterLinks.map((r) => Number(r.media_id)),
    [secondMedia],
  );
});

test('revision media must belong to the editor or the revised post', async () => {
  const { editorToken, adminToken, category } = await setupStaff();
  const otherEditor = await createUser({ role: 'editor' });
  const otherMedia = await createMedia(otherEditor.id);

  const published = await createPublishedPost(editorToken, adminToken, category.id);

  await request(app)
    .post(`/api/posts/${published.id}/revisions`)
    .set(authHeader(editorToken))
    .send({
      content: { type: 'doc', content: [{ type: 'image', attrs: { mediaId: otherMedia } }] },
      media: [{ media_id: otherMedia, usage_type: 'inline' }],
    })
    .expect(403);
});

test('editors cannot touch another editors post or revision', async () => {
  const { editor, editorToken, adminToken, category } = await setupStaff();
  const otherEditor = await createUser({ role: 'editor' });
  const otherToken = await login(otherEditor);

  const published = await createPublishedPost(editorToken, adminToken, category.id);

  await request(app)
    .post(`/api/posts/${published.id}/revisions`)
    .set(authHeader(otherToken))
    .send({ title: 'Intrusion' })
    .expect(403);

  const revisionRes = await request(app)
    .post(`/api/posts/${published.id}/revisions`)
    .set(authHeader(editorToken))
    .send({ title: 'Legit proposal' })
    .expect(201);
  const revisionId = revisionRes.body.data.id;

  await request(app)
    .post(`/api/post-revisions/${revisionId}/request-changes`)
    .set(authHeader(adminToken))
    .send({ feedback: 'Revise' })
    .expect(200);

  await request(app)
    .get(`/api/post-revisions/${revisionId}`)
    .set(authHeader(otherToken))
    .expect(403);
  await request(app)
    .patch(`/api/post-revisions/${revisionId}`)
    .set(authHeader(otherToken))
    .send({ title: 'Hijacked' })
    .expect(403);
  await request(app)
    .post(`/api/post-revisions/${revisionId}/submit-review`)
    .set(authHeader(otherToken))
    .expect(403);

  assert.ok(editor.id !== otherEditor.id);
});

test('public endpoints exclude every non-published workflow status', async () => {
  const { editorToken, adminToken, category } = await setupStaff();

  const draft = await createDraft(editorToken, category.id);

  const submitted = await createDraft(editorToken, category.id);
  await request(app)
    .post(`/api/posts/${submitted.id}/submit-review`)
    .set(authHeader(editorToken))
    .expect(200);

  const returned = await createDraft(editorToken, category.id);
  await request(app)
    .post(`/api/posts/${returned.id}/submit-review`)
    .set(authHeader(editorToken))
    .expect(200);
  await request(app)
    .post(`/api/posts/${returned.id}/request-changes`)
    .set(authHeader(adminToken))
    .send({ feedback: 'Not yet' })
    .expect(200);

  const unpublished = await createPublishedPost(editorToken, adminToken, category.id);
  await request(app)
    .patch(`/api/posts/${unpublished.id}`)
    .set(authHeader(adminToken))
    .send({ status: 'unpublished' })
    .expect(200);

  const list = await request(app).get('/api/posts?limit=50').expect(200);
  const ids = list.body.data.map((p) => p.id);
  for (const hidden of [draft, submitted, returned, unpublished]) {
    assert.ok(!ids.includes(hidden.id), `post ${hidden.id} must not be public`);
    await request(app).get(`/api/posts/${hidden.slug}`).expect(404);
  }

  // Managed endpoints scope editors to their own content.
  const managed = await request(app)
    .get('/api/posts/manage/list?limit=100')
    .set(authHeader(editorToken))
    .expect(200);
  const managedIds = managed.body.data.map((p) => p.id);
  assert.ok(managedIds.includes(draft.id));
  assert.ok(managedIds.includes(returned.id));
});

test('dashboard summary is role-appropriate', async () => {
  const { editorToken, adminToken, category } = await setupStaff();
  await createDraft(editorToken, category.id);

  const editorDash = await request(app)
    .get('/api/admin/dashboard')
    .set(authHeader(editorToken))
    .expect(200);
  assert.ok(editorDash.body.data.posts.total >= 1);
  assert.equal(editorDash.body.data.staff, undefined);

  const adminDash = await request(app)
    .get('/api/admin/dashboard')
    .set(authHeader(adminToken))
    .expect(200);
  assert.ok(adminDash.body.data.posts.total >= 1);
  assert.ok(adminDash.body.data.staff.active >= 1);
});
