const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const request = require('supertest');

const env = require('../src/config/env');
const db = require('../src/db/knex');
const app = require('../src/app');

if (env.db.database !== 'campus_kabar_test') {
  throw new Error(`Refusing to run HTTP auth tests against database "${env.db.database}"`);
}
if (env.db.port !== 3308) {
  throw new Error(`Refusing to run HTTP auth tests against port ${env.db.port}; expected 3308`);
}

const createdUserIds = new Set();

async function createUser(overrides = {}) {
  const password = overrides.password || 'test-password-1234';
  const passwordHash = await bcrypt.hash(password, 4);
  const email =
    overrides.email ||
    `http-auth-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;

  const [id] = await db('users').insert({
    name: overrides.name || 'HTTP Auth User',
    email,
    password_hash: passwordHash,
    role: overrides.role || 'editor',
    is_active: overrides.is_active === undefined ? true : overrides.is_active,
  });

  createdUserIds.add(id);
  return { id, email, password, role: overrides.role || 'editor' };
}

function cookieName() {
  return env.auth.cookie.name;
}

function getCookie(res, name) {
  const setCookie = res.headers['set-cookie'] || [];
  const entry = (Array.isArray(setCookie) ? setCookie : [setCookie]).find((c) =>
    String(c).startsWith(`${name}=`),
  );
  if (!entry) return null;
  return String(entry).split(';')[0];
}

test.after(async () => {
  if (createdUserIds.size > 0) {
    const ids = [...createdUserIds];
    await db('refresh_tokens').whereIn('user_id', ids).delete();
    await db('users').whereIn('id', ids).delete();
  }
  await db.destroy();
});

test('login succeeds and sets an HttpOnly refresh cookie', async () => {
  const user = await createUser();
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: user.email, password: user.password })
    .expect(200);

  assert.ok(res.body.accessToken);
  assert.equal(res.body.user.email, user.email);
  assert.equal(res.body.user.role, user.role);
  assert.ok(!res.body.refreshToken);

  const cookie = getCookie(res, cookieName());
  assert.ok(cookie, 'refresh cookie should be set');
  const setCookie = (res.headers['set-cookie'] || []).join(';');
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /Path=\/api\/auth/i);
});

test('login rejects a wrong password with a generic error', async () => {
  const user = await createUser();
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: user.email, password: 'wrong-password-1234' })
    .expect(401);

  assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
  assert.equal(res.body.error.message, 'Invalid email or password');
  assert.ok(!getCookie(res, cookieName()));
});

test('login rejects an inactive account with the same generic error', async () => {
  const user = await createUser({ is_active: false });
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: user.email, password: user.password })
    .expect(401);

  assert.equal(res.body.error.code, 'INVALID_CREDENTIALS');
});

test('login validates the request body', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: 'not-an-email', password: '' })
    .expect(400);

  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('me requires authentication', async () => {
  const res = await request(app).get('/api/auth/me').expect(401);
  assert.equal(res.body.error.code, 'ACCESS_TOKEN_REQUIRED');
});

test('me returns the DB user for a valid access token', async () => {
  const user = await createUser();
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: user.email, password: user.password })
    .expect(200);

  const res = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
    .expect(200);

  assert.equal(res.body.user.id, user.id);
  assert.equal(res.body.user.email, user.email);
  assert.equal(res.body.user.role, user.role);
});

test('me rejects a tampered access token', async () => {
  const user = await createUser();
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: user.email, password: user.password })
    .expect(200);

  const res = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${loginRes.body.accessToken}x`)
    .expect(401);

  assert.equal(res.body.error.code, 'ACCESS_TOKEN_INVALID');
});

test('authorization uses the DB role, not the JWT role claim', async () => {
  const user = await createUser({ role: 'editor' });
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: user.email, password: user.password })
    .expect(200);

  // Mutate the role directly in MySQL after token issuance.
  await db('users').where({ id: user.id }).update({ role: 'admin' });

  const res = await request(app)
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
    .expect(200);

  assert.equal(res.body.user.role, 'admin');
});

test('refresh rotates the token and updates the cookie', async () => {
  const user = await createUser();
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: user.email, password: user.password })
    .expect(200);

  const oldCookie = getCookie(loginRes, cookieName());
  assert.ok(oldCookie);

  const res = await request(app)
    .post('/api/auth/refresh')
    .set('Cookie', oldCookie)
    .expect(200);

  assert.ok(res.body.accessToken);
  // Access tokens are JWTs keyed on (user, second); two issuances in the
  // same second may be byte-identical, so rotation is proven by the refresh
  // cookie changing instead.
  const newCookie = getCookie(res, cookieName());
  assert.ok(newCookie);
  assert.notEqual(newCookie, oldCookie);

  // Old refresh token is now revoked.
  const oldTokenValue = oldCookie.split('=')[1];
  const { hashRefreshToken } = require('../src/utils/token');
  const row = await db('refresh_tokens')
    .where({ token_hash: hashRefreshToken(oldTokenValue) })
    .first();
  assert.ok(row.revoked_at);
});

test('refresh rejects a reused token and revokes only that session', async () => {
  const user = await createUser();
  const firstLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: user.email, password: user.password })
    .expect(200);
  const secondLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: user.email, password: user.password })
    .expect(200);

  const firstCookie = getCookie(firstLogin, cookieName());
  const secondCookie = getCookie(secondLogin, cookieName());

  const rotatedFirst = await request(app)
    .post('/api/auth/refresh')
    .set('Cookie', firstCookie)
    .expect(200);

  const reusedRes = await request(app)
    .post('/api/auth/refresh')
    .set('Cookie', firstCookie)
    .expect(401);
  assert.equal(reusedRes.body.error.code, 'REFRESH_TOKEN_REUSED');

  // Rotated replacement in the same session is also revoked.
  const rotatedCookie = getCookie(rotatedFirst, cookieName());
  const rotatedValue = rotatedCookie.split('=')[1];
  const { hashRefreshToken } = require('../src/utils/token');
  const rotatedRow = await db('refresh_tokens')
    .where({ token_hash: hashRefreshToken(rotatedValue) })
    .first();
  assert.ok(rotatedRow.revoked_at);

  // The other session remains usable.
  const otherRes = await request(app)
    .post('/api/auth/refresh')
    .set('Cookie', secondCookie)
    .expect(200);
  assert.ok(otherRes.body.accessToken);
});

test('refresh requires a cookie', async () => {
  const res = await request(app).post('/api/auth/refresh').expect(401);
  assert.equal(res.body.error.code, 'REFRESH_TOKEN_REQUIRED');
});

test('logout revokes the session and clears the cookie', async () => {
  const user = await createUser();
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: user.email, password: user.password })
    .expect(200);

  const cookie = getCookie(loginRes, cookieName());
  const res = await request(app)
    .post('/api/auth/logout')
    .set('Cookie', cookie)
    .expect(204);

  const setCookie = (res.headers['set-cookie'] || []).join(';');
  // Cookie cleared (max-age 0 or expires in past).
  assert.ok(
    /ck_refresh=;/.test(setCookie) || /Max-Age=0/i.test(setCookie) || /Expires=Thu, 01 Jan 1970/i.test(setCookie),
    'cookie should be cleared',
  );

  // Subsequent refresh with the old cookie fails.
  await request(app)
    .post('/api/auth/refresh')
    .set('Cookie', cookie)
    .expect(401);
});

test('origin validation rejects a disallowed origin on cookie routes', async () => {
  const user = await createUser();
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: user.email, password: user.password })
    .expect(200);

  const cookie = getCookie(loginRes, cookieName());
  const res = await request(app)
    .post('/api/auth/refresh')
    .set('Cookie', cookie)
    .set('Origin', 'http://evil.example')
    .expect(403);

  assert.equal(res.body.error.code, 'ORIGIN_NOT_ALLOWED');
});

test('origin validation allows a configured origin', async () => {
  const user = await createUser();
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: user.email, password: user.password })
    .expect(200);

  const cookie = getCookie(loginRes, cookieName());
  // No usable refresh after logout? Still has cookie; origin allowed -> not 403.
  const res = await request(app)
    .post('/api/auth/refresh')
    .set('Cookie', cookie)
    .set('Origin', 'http://localhost:5173');

  // Either success (200) or invalid token (401) but never origin rejection.
  assert.notEqual(res.status, 403);
});

test('rate limiter adds rate-limit headers', async () => {
  const user = await createUser();
  const res = await request(app)
    .post('/api/auth/login')
    .send({ email: user.email, password: user.password })
    .expect(200);

  assert.ok(res.headers['ratelimit-limit'] || res.headers['x-ratelimit-limit']);
});

test('authorize middleware allows matching role and rejects others', () => {
  const { authorize } = require('../src/middleware/authenticate');

  let nextCalled = false;
  const reqAllowed = { user: { role: 'admin' } };
  authorize('admin')(reqAllowed, {}, (err) => {
    if (!err) nextCalled = true;
  });
  assert.equal(nextCalled, true);

  let errReceived;
  const reqDenied = { user: { role: 'editor' } };
  authorize('admin')(reqDenied, {}, (err) => {
    errReceived = err;
  });
  assert.equal(errReceived.status, 403);
  assert.equal(errReceived.code, 'FORBIDDEN');
});

test('authorize rejects when no user is present', () => {
  const { authorize } = require('../src/middleware/authenticate');
  let errReceived;
  authorize('admin')({}, {}, (err) => {
    errReceived = err;
  });
  assert.equal(errReceived.status, 401);
  assert.equal(errReceived.code, 'AUTHENTICATION_REQUIRED');
});
