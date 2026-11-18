const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

const env = require('../config/env');
const { httpError } = require('./errors');

const ACCESS_TOKEN_TYPE = 'access';
const REFRESH_TOKEN_BYTES = 32;

function signAccessToken(user) {
  if (!user || user.id === undefined || user.id === null) {
    throw new Error('A user with an id is required to sign an access token');
  }

  return jwt.sign(
    {
      sub: String(user.id),
      role: user.role,
      type: ACCESS_TOKEN_TYPE,
    },
    env.auth.accessSecret,
    {
      algorithm: 'HS256',
      expiresIn: env.auth.accessTokenTtlSeconds,
    },
  );
}

function verifyAccessToken(token) {
  if (typeof token !== 'string' || token === '') {
    throw httpError(401, 'ACCESS_TOKEN_INVALID', 'Access token is required');
  }

  let payload;

  try {
    payload = jwt.verify(token, env.auth.accessSecret, {
      algorithms: ['HS256'],
    });
  } catch (error) {
    if (error && error.name === 'TokenExpiredError') {
      throw httpError(401, 'ACCESS_TOKEN_EXPIRED', 'Access token expired');
    }

    throw httpError(401, 'ACCESS_TOKEN_INVALID', 'Invalid access token');
  }

  if (!payload || payload.type !== ACCESS_TOKEN_TYPE || !payload.sub) {
    throw httpError(401, 'ACCESS_TOKEN_INVALID', 'Invalid access token');
  }

  return payload;
}

function generateRefreshToken() {
  const token = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');

  return {
    token,
    hash: hashRefreshToken(token),
  };
}

function hashRefreshToken(token) {
  if (typeof token !== 'string' || token === '') {
    throw new Error('Refresh token must be a non-empty string');
  }

  return crypto.createHash('sha256').update(token, 'utf8').digest('hex');
}

module.exports = {
  ACCESS_TOKEN_TYPE,
  REFRESH_TOKEN_BYTES,
  signAccessToken,
  verifyAccessToken,
  generateRefreshToken,
  hashRefreshToken,
};
