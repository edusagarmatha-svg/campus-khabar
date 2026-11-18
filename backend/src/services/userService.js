const bcrypt = require('bcrypt');
const db = require('../db/knex');
const { httpError } = require('../utils/errors');
const { toPublicUser } = require('./authService');

const BCRYPT_COST = 12;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_BYTES = 72;
const VALID_ROLES = ['admin', 'editor'];

function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

function validatePassword(password) {
  if (typeof password !== 'string') {
    throw httpError(400, 'INVALID_PASSWORD', 'Password is required');
  }
  if (password.trim().length < MIN_PASSWORD_LENGTH) {
    throw httpError(400, 'INVALID_PASSWORD', `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    throw httpError(400, 'INVALID_PASSWORD', 'Password is too long');
  }
}

async function countActiveAdmins(excludeId = null) {
  let query = db('users').where({ role: 'admin', is_active: true });
  if (excludeId !== null) {
    query = query.whereNot({ id: excludeId });
  }
  const row = await query.count({ total: '*' }).first();
  return Number(row.total) || 0;
}

async function getUserRow(id) {
  const userId = Number(id);
  if (!Number.isInteger(userId) || userId <= 0) {
    throw httpError(400, 'INVALID_USER_ID', 'Invalid user id');
  }
  const row = await db('users').where({ id: userId }).first();
  if (!row) {
    throw httpError(404, 'USER_NOT_FOUND', 'User not found');
  }
  return row;
}

async function listUsers(filters = {}, pagination = {}) {
  const page = Math.max(1, Number(pagination.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(pagination.limit) || 20));
  const offset = (page - 1) * limit;

  let query = db('users');

  if (filters.role && VALID_ROLES.includes(filters.role)) {
    query = query.where({ role: filters.role });
  }
  if (filters.is_active !== undefined) {
    query = query.where({ is_active: Boolean(filters.is_active) });
  }
  if (filters.q) {
    const term = `%${String(filters.q).trim()}%`;
    query = query.where((qb) => {
      qb.where('name', 'like', term).orWhere('email', 'like', term);
    });
  }

  const countQuery = query.clone().clearSelect().count({ total: '*' }).first();
  const { total } = await countQuery;

  const rows = await query.clone().orderBy('created_at', 'desc').orderBy('id', 'desc').limit(limit).offset(offset);
  return {
    data: rows.map(toPublicUser),
    pagination: { page, limit, total: Number(total) || 0 },
  };
}

async function getUser(id) {
  const row = await getUserRow(id);
  return toPublicUser(row);
}

async function createUser(input) {
  const name = String(input.name || '').trim();
  if (name.length < 1 || name.length > 120) {
    throw httpError(400, 'INVALID_NAME', 'Name must be 1-120 characters');
  }

  const email = normalizeEmail(input.email || '');
  // basic email shape check; zod handles stricter validation in route
  if (!email || !email.includes('@')) {
    throw httpError(400, 'INVALID_EMAIL', 'A valid email is required');
  }
  if (email.length > 255) {
    throw httpError(400, 'INVALID_EMAIL', 'Email must be at most 255 characters');
  }

  const role = input.role || 'editor';
  if (!VALID_ROLES.includes(role)) {
    throw httpError(400, 'INVALID_ROLE', 'Role must be admin or editor');
  }

  validatePassword(input.password);

  const existing = await db('users').where({ email }).first();
  if (existing) {
    throw httpError(409, 'EMAIL_IN_USE', 'Email is already registered');
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);

  const [id] = await db('users').insert({
    name,
    email,
    password_hash: passwordHash,
    role,
    is_active: input.is_active === undefined ? true : Boolean(input.is_active),
  });

  return getUser(id);
}

async function updateUser(id, currentUser, input) {
  const row = await getUserRow(id);

  const updates = {};

  if (input.name !== undefined) {
    const name = String(input.name).trim();
    if (name.length < 1 || name.length > 120) {
      throw httpError(400, 'INVALID_NAME', 'Name must be 1-120 characters');
    }
    updates.name = name;
  }

  if (input.email !== undefined) {
    const email = normalizeEmail(input.email);
    if (!email || !email.includes('@') || email.length > 255) {
      throw httpError(400, 'INVALID_EMAIL', 'A valid email is required');
    }
    const existing = await db('users').where({ email }).whereNot({ id: row.id }).first();
    if (existing) {
      throw httpError(409, 'EMAIL_IN_USE', 'Email is already registered');
    }
    updates.email = email;
  }

  if (input.role !== undefined) {
    if (!VALID_ROLES.includes(input.role)) {
      throw httpError(400, 'INVALID_ROLE', 'Role must be admin or editor');
    }
    // Prevent removing the last active admin.
    if (row.role === 'admin' && input.role !== 'admin' && row.is_active) {
      const otherActiveAdmins = await countActiveAdmins(row.id);
      if (otherActiveAdmins === 0) {
        throw httpError(409, 'LAST_ADMIN', 'Cannot remove the last active admin');
      }
    }
    updates.role = input.role;
  }

  if (input.is_active !== undefined) {
    const nextActive = Boolean(input.is_active);
    // Prevent deactivating the last active admin (takes precedence over self check).
    if (row.role === 'admin' && row.is_active && !nextActive) {
      const otherActiveAdmins = await countActiveAdmins(row.id);
      if (otherActiveAdmins === 0) {
        throw httpError(409, 'LAST_ADMIN', 'Cannot deactivate the last active admin');
      }
    }
    // Prevent self-deactivation.
    if (Number(currentUser.id) === Number(row.id) && !nextActive) {
      throw httpError(400, 'SELF_DEACTIVATION', 'You cannot deactivate your own account');
    }
    updates.is_active = nextActive;
  }

  if (input.password !== undefined && input.password !== null && String(input.password) !== '') {
    validatePassword(input.password);
    updates.password_hash = await bcrypt.hash(input.password, BCRYPT_COST);
  }

  if (Object.keys(updates).length === 0) {
    return toPublicUser(row);
  }

  updates.updated_at = new Date();

  await db('users').where({ id: row.id }).update(updates);
  return getUser(row.id);
}

module.exports = {
  listUsers,
  getUser,
  createUser,
  updateUser,
  toPublicUser,
};
