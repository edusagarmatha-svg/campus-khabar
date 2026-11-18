const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const request = require('supertest');

const env = require('../src/config/env');
const db = require('../src/db/knex');
const app = require('../src/app');

if (env.db.database !== 'campus_kabar_test') {
  throw new Error(`Refusing to run user tests against database "${env.db.database}"`);
}
if (env.db.port !== 3308) {
  throw new Error(`Refusing to run user tests against port ${env.db.port}; expected 3308`);
}

const createdUserIds = new Set();

async function createUserDirect(overrides = {}) {
  const password = overrides.password || 'test-password-1234';
  const passwordHash = await bcrypt.hash(password, 4);
  const email =
    overrides.email ||
    `user-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;

  const [id] = await db('users').insert({
    name: overrides.name || 'User Test',
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

test.after(async () => {
  if (createdUserIds.size > 0) {
    const ids = [...createdUserIds];
    await db('refresh_tokens').whereIn('user_id', ids).delete();
    await db('users').whereIn('id', ids).delete();
  }
  await db.destroy();
});

test('unauthenticated and non-admin access is rejected', async () => {
  await request(app).get('/api/users').expect(401);
  await request(app).post('/api/users').send({}).expect(401);

  const editor = await createUserDirect({ role: 'editor' });
  const editorToken = await login(editor);

  await request(app).get('/api/users').set(authHeader(editorToken)).expect(403);
  await request(app).post('/api/users').set(authHeader(editorToken)).send({}).expect(403);
});

test('admin can create a user and password hash is not exposed', async () => {
  const admin = await createUserDirect({ role: 'admin' });
  const adminToken = await login(admin);

  const email = `new-${Date.now()}@example.com`;
  const res = await request(app)
    .post('/api/users')
    .set(authHeader(adminToken))
    .send({
      name: 'New Staff',
      email,
      password: 'test-password-1234',
      role: 'editor',
    })
    .expect(201);

  assert.equal(res.body.data.email, email);
  assert.equal(res.body.data.role, 'editor');
  assert.equal(res.body.data.is_active, true);
  assert.ok(!res.body.data.password_hash);

  createdUserIds.add(res.body.data.id);

  // created user can log in
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email, password: 'test-password-1234' })
    .expect(200);
  assert.ok(loginRes.body.accessToken);
});

test('duplicate email returns 409 and invalid password returns 400', async () => {
  const admin = await createUserDirect({ role: 'admin' });
  const adminToken = await login(admin);

  const email = `dup-${Date.now()}@example.com`;
  await request(app)
    .post('/api/users')
    .set(authHeader(adminToken))
    .send({ name: 'A', email, password: 'test-password-1234', role: 'editor' })
    .expect(201)
    .then((r) => createdUserIds.add(r.body.data.id));

  await request(app)
    .post('/api/users')
    .set(authHeader(adminToken))
    .send({ name: 'B', email, password: 'test-password-1234', role: 'editor' })
    .expect(409);

  await request(app)
    .post('/api/users')
    .set(authHeader(adminToken))
    .send({ name: 'C', email: `short-${Date.now()}@example.com`, password: 'short', role: 'editor' })
    .expect(400);
});

test('admin can list and get users', async () => {
  const admin = await createUserDirect({ role: 'admin' });
  const adminToken = await login(admin);

  const res = await request(app)
    .get('/api/users')
    .set(authHeader(adminToken))
    .expect(200);

  assert.ok(Array.isArray(res.body.data));
  assert.ok(res.body.pagination);

  const getRes = await request(app)
    .get(`/api/users/${admin.id}`)
    .set(authHeader(adminToken))
    .expect(200);
  assert.equal(getRes.body.data.id, admin.id);
  assert.ok(!getRes.body.data.password_hash);
});

test('admin can update user fields', async () => {
  const admin = await createUserDirect({ role: 'admin' });
  const adminToken = await login(admin);
  const target = await createUserDirect({ role: 'editor' });

  const res = await request(app)
    .patch(`/api/users/${target.id}`)
    .set(authHeader(adminToken))
    .send({ name: 'Updated Name', role: 'admin', is_active: false })
    .expect(200);

  assert.equal(res.body.data.name, 'Updated Name');
  assert.equal(res.body.data.role, 'admin');
  assert.equal(res.body.data.is_active, false);
  assert.ok(!res.body.data.password_hash);
});

test('self-deactivation is prevented', async () => {
  const admin = await createUserDirect({ role: 'admin' });
  const adminToken = await login(admin);

  await request(app)
    .patch(`/api/users/${admin.id}`)
    .set(authHeader(adminToken))
    .send({ is_active: false })
    .expect(400);
});

test('last active admin cannot be deactivated or demoted', async () => {
  const admin = await createUserDirect({ role: 'admin' });
  // Temporarily deactivate every other active admin (including the seeded test admin)
  // so this admin is the only active one for the duration of the test.
  const others = await db('users').where({ role: 'admin', is_active: true }).whereNot({ id: admin.id }).select('id');
  const otherIds = others.map((r) => r.id);
  if (otherIds.length > 0) {
    await db('users').whereIn('id', otherIds).update({ is_active: false });
  }
  const adminToken = await login(admin);

  let restored = false;
  try {

  // deactivating the last active admin is blocked
  await request(app)
    .patch(`/api/users/${admin.id}`)
    .set(authHeader(adminToken))
    .send({ is_active: false })
    .expect(409);

  // With a second admin, deactivation of one is allowed
  const admin2 = await createUserDirect({ role: 'admin' });
  const res = await request(app)
    .patch(`/api/users/${admin2.id}`)
    .set(authHeader(adminToken))
    .send({ is_active: false })
    .expect(200);
  assert.equal(res.body.data.is_active, false);

  // Now admin is the last active admin; demotion must fail
  await request(app)
    .patch(`/api/users/${admin.id}`)
    .set(authHeader(adminToken))
    .send({ role: 'editor' })
    .expect(409);

  // and deactivation must fail
  await request(app)
    .patch(`/api/users/${admin.id}`)
    .set(authHeader(adminToken))
    .send({ is_active: false })
    .expect(409);
  } finally {
    if (otherIds.length > 0) {
      await db('users').whereIn('id', otherIds).update({ is_active: true });
    }
    restored = true;
  }
  assert.equal(restored, true);
});
