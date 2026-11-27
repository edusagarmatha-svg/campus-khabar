const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');

const env = require('../src/config/env');
const db = require('../src/db/knex');
const token = require('../src/utils/token');
const authService = require('../src/services/authService');

// These tests mutate data. Refuse to run unless pointed at the disposable
// authentication test database.
if (env.db.database !== 'campus_kabar_test') {
  throw new Error(
    `Refusing to run auth tests against database "${env.db.database}"`,
  );
}

if (env.db.port !== 3308) {
  throw new Error(
    `Refusing to run auth tests against port ${env.db.port}; expected 3308`,
  );
}

const createdUserIds = new Set();

async function createUser(overrides = {}) {
  const password = overrides.password || 'test-password-1234';
  const passwordHash = await bcrypt.hash(password, 4);
  const email =
    overrides.email ||
    `auth-test-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;

  const [id] = await db('users').insert({
    name: overrides.name || 'Auth Test User',
    email,
    password_hash: passwordHash,
    role: overrides.role || 'editor',
    is_active: overrides.is_active === undefined ? true : overrides.is_active,
  });

  createdUserIds.add(id);
  return { id, email, password, role: overrides.role || 'editor' };
}

test.after(async () => {
  if (createdUserIds.size > 0) {
    const ids = [...createdUserIds];
    await db('refresh_tokens').whereIn('user_id', ids).delete();
    await db('users').whereIn('id', ids).delete();
  }
  await db.destroy();
});

test('access token signs and verifies', () => {
  const accessToken = token.signAccessToken({ id: 42, role: 'editor' });
  const payload = token.verifyAccessToken(accessToken);

  assert.equal(payload.sub, '42');
  assert.equal(payload.role, 'editor');
  assert.equal(payload.type, 'access');
});

test('tampered access token is rejected', () => {
  const accessToken = token.signAccessToken({ id: 42, role: 'editor' });

  assert.throws(
    () => token.verifyAccessToken(`${accessToken}x`),
    (error) => error.code === 'ACCESS_TOKEN_INVALID' && error.status === 401,
  );
});

test('refresh token is opaque and hashed with SHA-256', () => {
  const { token: refreshToken, hash } = token.generateRefreshToken();

  assert.equal(hash, token.hashRefreshToken(refreshToken));
  assert.equal(hash.length, 64);
  assert.ok(refreshToken.length >= 32);
});

test('verifyCredentials succeeds for a valid active user', async () => {
  const user = await createUser();
  const verified = await authService.verifyCredentials(user.email, user.password);

  assert.equal(verified.id, user.id);
  assert.equal(verified.email, user.email);
  assert.equal(verified.role, user.role);
});

test('verifyCredentials rejects a wrong password', async () => {
  const user = await createUser();

  await assert.rejects(
    authService.verifyCredentials(user.email, 'wrong-password-1234'),
    (error) => error.code === 'INVALID_CREDENTIALS' && error.status === 401,
  );
});

test('verifyCredentials rejects an inactive account', async () => {
  const user = await createUser({ is_active: false });

  await assert.rejects(
    authService.verifyCredentials(user.email, user.password),
    (error) => error.code === 'INVALID_CREDENTIALS' && error.status === 401,
  );
});

test('createSession stores a hashed refresh token and sets last_login_at', async () => {
  const user = await createUser();
  const session = await authService.createSession({
    id: user.id,
    role: user.role,
  });

  assert.ok(session.accessToken);
  assert.ok(session.refreshToken);

  const row = await db('refresh_tokens')
    .where({ token_hash: token.hashRefreshToken(session.refreshToken) })
    .first();

  assert.ok(row);
  assert.equal(row.user_id, user.id);
  assert.equal(row.revoked_at, null);
  assert.ok(new Date(row.expires_at).getTime() > Date.now());

  const dbUser = await db('users').where({ id: user.id }).first();
  assert.ok(dbUser.last_login_at);
});

test('rotateRefreshToken rotates and revokes the previous token', async () => {
  const user = await createUser();
  const session = await authService.createSession({ id: user.id, role: user.role });

  const rotated = await authService.rotateRefreshToken(session.refreshToken);

  assert.ok(rotated.accessToken);
  assert.ok(rotated.refreshToken);
  assert.notEqual(rotated.refreshToken, session.refreshToken);

  const oldRow = await db('refresh_tokens')
    .where({ token_hash: token.hashRefreshToken(session.refreshToken) })
    .first();
  const newRow = await db('refresh_tokens')
    .where({ token_hash: token.hashRefreshToken(rotated.refreshToken) })
    .first();

  assert.ok(oldRow.revoked_at);
  assert.equal(oldRow.replaced_by_id, newRow.id);
  assert.equal(newRow.session_id, oldRow.session_id);
  assert.equal(newRow.revoked_at, null);

  const secondRotation = await authService.rotateRefreshToken(rotated.refreshToken);
  assert.ok(secondRotation.accessToken);
});

test('refresh-token reuse revokes only the affected session', async () => {
  const user = await createUser();
  const firstSession = await authService.createSession({ id: user.id, role: user.role });
  const secondSession = await authService.createSession({ id: user.id, role: user.role });

  const rotatedFirst = await authService.rotateRefreshToken(firstSession.refreshToken);

  await assert.rejects(
    authService.rotateRefreshToken(firstSession.refreshToken),
    (error) => error.code === 'REFRESH_TOKEN_REUSED' && error.status === 401,
  );

  // Reuse revocation also removes the rotated replacement in the same session.
  await assert.rejects(
    authService.rotateRefreshToken(rotatedFirst.refreshToken),
    (error) =>
      (error.code === 'REFRESH_TOKEN_REVOKED' ||
        error.code === 'REFRESH_TOKEN_INVALID') &&
      error.status === 401,
  );

  // The other session remains usable.
  const rotatedSecond = await authService.rotateRefreshToken(secondSession.refreshToken);
  assert.ok(rotatedSecond.accessToken);
});

test('expired refresh token cannot rotate', async () => {
  const user = await createUser();
  const { token: refreshToken, hash } = token.generateRefreshToken();

  await db('refresh_tokens').insert({
    user_id: user.id,
    session_id: crypto.randomUUID(),
    token_hash: hash,
    expires_at: new Date(Date.now() - 1000),
    revoked_at: null,
    replaced_by_id: null,
  });

  await assert.rejects(
    authService.rotateRefreshToken(refreshToken),
    (error) => error.code === 'REFRESH_TOKEN_EXPIRED' && error.status === 401,
  );
});

test('invalid refresh token cannot rotate', async () => {
  await assert.rejects(
    authService.rotateRefreshToken('definitely-not-a-token'),
    (error) => error.code === 'REFRESH_TOKEN_INVALID' && error.status === 401,
  );
});

test('revokeSession is idempotent and session-scoped', async () => {
  const user = await createUser();
  const session = await authService.createSession({ id: user.id, role: user.role });

  await authService.revokeSession(session.refreshToken);
  await authService.revokeSession(session.refreshToken);

  const row = await db('refresh_tokens')
    .where({ token_hash: token.hashRefreshToken(session.refreshToken) })
    .first();

  assert.ok(row.revoked_at);
});

test('concurrent refresh with the same token is handled safely', async () => {
  const user = await createUser();
  const session = await authService.createSession({ id: user.id, role: user.role });

  const results = await Promise.allSettled([
    authService.rotateRefreshToken(session.refreshToken),
    authService.rotateRefreshToken(session.refreshToken),
  ]);

  const fulfilled = results.filter((result) => result.status === 'fulfilled');
  const rejected = results.filter((result) => result.status === 'rejected');

  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason.code, 'REFRESH_TOKEN_REUSED');
});
