const db = require('../db/knex');
const env = require('../config/env');
const { httpError } = require('../utils/errors');
const { verifyAccessToken } = require('../utils/token');

async function authenticate(req, res, next) {
  const header = req.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());

  if (!match) {
    return next(httpError(401, 'ACCESS_TOKEN_REQUIRED', 'Access token is required'));
  }

  let payload;
  try {
    payload = verifyAccessToken(match[1]);
  } catch (error) {
    return next(error);
  }

  const userId = Number(payload.sub);
  if (!Number.isInteger(userId) || userId <= 0) {
    return next(httpError(401, 'ACCESS_TOKEN_INVALID', 'Invalid access token'));
  }

  // Never trust the JWT role claim: load the current user and role from MySQL.
  const row = await db('users').where({ id: userId }).first();
  if (!row) {
    return next(httpError(401, 'USER_NOT_FOUND', 'User not found'));
  }
  if (!row.is_active) {
    return next(httpError(403, 'USER_INACTIVE', 'User account is inactive'));
  }

  req.user = {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    is_active: Boolean(row.is_active),
    last_login_at: row.last_login_at || null,
  };

  next();
}

function authorize(...allowedRoles) {
  const roles = allowedRoles.flat();
  return (req, res, next) => {
    if (!req.user) {
      return next(httpError(401, 'AUTHENTICATION_REQUIRED', 'Authentication required'));
    }
    if (roles.length > 0 && !roles.includes(req.user.role)) {
      return next(httpError(403, 'FORBIDDEN', 'Insufficient permissions'));
    }
    next();
  };
}

module.exports = { authenticate, authorize };
