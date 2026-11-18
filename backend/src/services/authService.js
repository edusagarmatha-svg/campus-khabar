const crypto = require('node:crypto');
const bcrypt = require('bcrypt');

const db = require('../db/knex');
const env = require('../config/env');
const { httpError } = require('../utils/errors');
const {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
} = require('../utils/token');

const REFRESH_TOKEN_TTL_MS = env.auth.refreshTokenTtlSeconds * 1000;

function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

function toPublicUser(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    is_active: Boolean(row.is_active),
    last_login_at: row.last_login_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function findUserByEmail(email) {
  return db('users').where({ email: normalizeEmail(email) }).first();
}

async function getUserById(id, { requireActive = false } = {}) {
  const user = await db('users').where({ id }).first();

  if (!user) {
    throw httpError(401, 'USER_NOT_FOUND', 'User not found');
  }

  if (requireActive && !user.is_active) {
    throw httpError(403, 'USER_INACTIVE', 'User account is inactive');
  }

  return toPublicUser(user);
}

async function verifyCredentials(email, password) {
  if (typeof email !== 'string' || typeof password !== 'string') {
    throw httpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  const user = await findUserByEmail(email);

  // Keep the failure mode identical for unknown email, wrong password, and
  // inactive account so login responses cannot be used to enumerate users.
  if (!user || !user.is_active) {
    throw httpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  const passwordMatches = await bcrypt.compare(password, user.password_hash);

  if (!passwordMatches) {
    throw httpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  return toPublicUser(user);
}

async function createSession(user) {
  if (!user || !user.id) {
    throw new Error('A user is required to create a session');
  }

  const sessionId = crypto.randomUUID();
  const { token: refreshToken, hash: refreshTokenHash } = generateRefreshToken();
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  await db.transaction(async (trx) => {
    const [insertedId] = await trx('refresh_tokens').insert({
      user_id: user.id,
      session_id: sessionId,
      token_hash: refreshTokenHash,
      expires_at: refreshExpiresAt,
      revoked_at: null,
      replaced_by_id: null,
    });

    if (!insertedId) {
      throw new Error('Failed to create refresh-token row');
    }

    await trx('users')
      .where({ id: user.id })
      .update({ last_login_at: new Date() });
  });

  const accessToken = signAccessToken(user);

  return {
    accessToken,
    refreshToken,
    user: toPublicUser(
      await db('users').where({ id: user.id }).first(),
    ),
  };
}

async function rotateRefreshToken(refreshToken) {
  if (typeof refreshToken !== 'string' || refreshToken === '') {
    throw httpError(401, 'REFRESH_TOKEN_INVALID', 'Refresh token is required');
  }

  const tokenHash = hashRefreshToken(refreshToken);
  const now = new Date();
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  let sessionId;
  let userId;
  let userRow;
  let newRefreshToken;
  let errorToThrow = null;

  await db.transaction(async (trx) => {
    // Lock the presented token row so concurrent refreshes with the same token
    // cannot both succeed. The second request waits for this transaction, then
    // observes the row as revoked and is treated as reuse.
    const tokenRow = await trx('refresh_tokens')
      .where({ token_hash: tokenHash })
      .forUpdate()
      .first();

    if (!tokenRow) {
      errorToThrow = httpError(401, 'REFRESH_TOKEN_INVALID', 'Invalid refresh token');
      return;
    }

    if (tokenRow.revoked_at) {
      if (tokenRow.replaced_by_id) {
        // Reuse of a rotated token: revoke every still-active token in this
        // session only. Other sessions for the same user are untouched. This
        // update is committed because the callback returns normally instead of
        // throwing inside the transaction.
        await trx('refresh_tokens')
          .where({ session_id: tokenRow.session_id })
          .whereNull('revoked_at')
          .update({ revoked_at: now });

        errorToThrow = httpError(
          401,
          'REFRESH_TOKEN_REUSED',
          'Refresh token reuse detected',
        );
        return;
      }

      errorToThrow = httpError(401, 'REFRESH_TOKEN_REVOKED', 'Refresh token revoked');
      return;
    }

    if (new Date(tokenRow.expires_at) <= now) {
      await trx('refresh_tokens')
        .where({ id: tokenRow.id })
        .update({ revoked_at: now });

      errorToThrow = httpError(401, 'REFRESH_TOKEN_EXPIRED', 'Refresh token expired');
      return;
    }

    userRow = await trx('users').where({ id: tokenRow.user_id }).first();

    if (!userRow || !userRow.is_active) {
      await trx('refresh_tokens')
        .where({ session_id: tokenRow.session_id })
        .whereNull('revoked_at')
        .update({ revoked_at: now });

      errorToThrow = httpError(401, 'USER_INACTIVE', 'User account is inactive');
      return;
    }

    sessionId = tokenRow.session_id;
    userId = tokenRow.user_id;

    const generated = generateRefreshToken();
    newRefreshToken = generated.token;
    const newRefreshTokenHash = generated.hash;

    const [newTokenId] = await trx('refresh_tokens').insert({
      user_id: userId,
      session_id: sessionId,
      token_hash: newRefreshTokenHash,
      expires_at: refreshExpiresAt,
      revoked_at: null,
      replaced_by_id: null,
    });

    if (!newTokenId) {
      errorToThrow = new Error('Failed to rotate refresh token');
      return;
    }

    await trx('refresh_tokens')
      .where({ id: tokenRow.id })
      .update({
        revoked_at: now,
        replaced_by_id: newTokenId,
      });

  });

  if (errorToThrow) {
    throw errorToThrow;
  }

  if (!newRefreshToken) {
    throw new Error('Failed to rotate refresh token');
  }

  const accessToken = signAccessToken(userRow);

  return {
    accessToken,
    refreshToken: newRefreshToken,
    user: toPublicUser(userRow),
  };
}

async function revokeSession(refreshToken) {
  if (typeof refreshToken !== 'string' || refreshToken === '') {
    return;
  }

  const tokenHash = hashRefreshToken(refreshToken);
  const now = new Date();

  await db.transaction(async (trx) => {
    const tokenRow = await trx('refresh_tokens')
      .where({ token_hash: tokenHash })
      .forUpdate()
      .first();

    if (!tokenRow) {
      return;
    }

    await trx('refresh_tokens')
      .where({ session_id: tokenRow.session_id })
      .whereNull('revoked_at')
      .update({ revoked_at: now });
  });
}

module.exports = {
  normalizeEmail,
  toPublicUser,
  findUserByEmail,
  getUserById,
  verifyCredentials,
  createSession,
  rotateRefreshToken,
  revokeSession,
};
