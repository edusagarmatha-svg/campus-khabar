const db = require('../db/knex');
const { httpError } = require('../utils/errors');
const { slugify, isValidSlug } = require('../utils/slug');

const CATEGORY_NAME_MAX = 120;
const CATEGORY_SLUG_MAX = 160;

function normalizeCategoryInput(input = {}) {
  const out = {};

  if (input.name !== undefined) {
    const name = String(input.name).trim();
    if (name.length < 1 || name.length > CATEGORY_NAME_MAX) {
      throw httpError(400, 'INVALID_CATEGORY_NAME', `Category name must be 1-${CATEGORY_NAME_MAX} characters`);
    }
    out.name = name;
  }

  if (input.slug !== undefined && input.slug !== null && String(input.slug).trim() !== '') {
    const slug = slugify(input.slug);
    if (!isValidSlug(slug)) {
      throw httpError(400, 'INVALID_CATEGORY_SLUG', 'Category slug is invalid');
    }
    out.slug = slug.slice(0, CATEGORY_SLUG_MAX);
  }

  if (input.description !== undefined) {
    if (input.description === null || String(input.description).trim() === '') {
      out.description = null;
    } else {
      const description = String(input.description).trim();
      if (description.length > 500) {
        throw httpError(400, 'INVALID_CATEGORY_DESCRIPTION', 'Category description must be at most 500 characters');
      }
      out.description = description;
    }
  }

  if (input.is_active !== undefined) {
    out.is_active = Boolean(input.is_active);
  }

  if (input.sort_order !== undefined) {
    const sortOrder = Number(input.sort_order);
    if (!Number.isInteger(sortOrder)) {
      throw httpError(400, 'INVALID_SORT_ORDER', 'sort_order must be an integer');
    }
    out.sort_order = sortOrder;
  }

  return out;
}

async function ensureUniqueCategorySlug(baseSlug, excludeId = null) {
  let candidate = baseSlug;
  let suffix = 2;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let query = db('categories').where({ slug: candidate });
    if (excludeId !== null) {
      query = query.whereNot({ id: excludeId });
    }
    const existing = await query.first();
    if (!existing) {
      return candidate;
    }
    candidate = `${baseSlug}-${suffix}`.slice(0, CATEGORY_SLUG_MAX);
    suffix += 1;
    if (suffix > 1000) {
      throw httpError(409, 'SLUG_UNAVAILABLE', 'Unable to generate a unique category slug');
    }
  }
}

function toPublicCategory(row) {
  if (!row) return null;
  return { ...row, is_active: Boolean(row.is_active) };
}

async function listCategories({ activeOnly = false } = {}) {
  let query = db('categories');
  if (activeOnly) {
    query = query.where({ is_active: true });
  }
  const rows = await query.orderBy('sort_order', 'asc').orderBy('name', 'asc');
  return rows.map(toPublicCategory);
}

async function getCategoryById(id) {
  const row = await db('categories').where({ id }).first();
  if (!row) {
    throw httpError(404, 'CATEGORY_NOT_FOUND', 'Category not found');
  }
  return toPublicCategory(row);
}

async function getCategoryBySlug(slug) {
  const row = await db('categories').where({ slug }).first();
  if (!row) {
    throw httpError(404, 'CATEGORY_NOT_FOUND', 'Category not found');
  }
  return toPublicCategory(row);
}

async function createCategory(input) {
  const normalized = normalizeCategoryInput(input || {});
  if (!normalized.name) {
    throw httpError(400, 'INVALID_CATEGORY_NAME', 'Category name is required');
  }

  const baseSlug = normalized.slug || slugify(normalized.name);
  if (!isValidSlug(baseSlug)) {
    throw httpError(400, 'INVALID_CATEGORY_SLUG', 'Category slug is invalid');
  }
  const slug = await ensureUniqueCategorySlug(baseSlug);

  const payload = {
    name: normalized.name,
    slug,
    description: normalized.description === undefined ? null : normalized.description,
    is_active: normalized.is_active === undefined ? true : normalized.is_active,
    sort_order: normalized.sort_order === undefined ? 0 : normalized.sort_order,
  };

  try {
    const [id] = await db('categories').insert(payload);
    return getCategoryById(id);
  } catch (error) {
    if (error && (error.code === 'ER_DUP_ENTRY' || error.errno === 1062)) {
      throw httpError(409, 'CATEGORY_CONFLICT', 'Category name or slug already exists');
    }
    throw error;
  }
}

async function updateCategory(id, input) {
  const existing = await getCategoryById(id);
  const normalized = normalizeCategoryInput(input || {});

  const updates = {};
  if (normalized.name !== undefined) updates.name = normalized.name;
  if (normalized.description !== undefined) updates.description = normalized.description;
  if (normalized.is_active !== undefined) updates.is_active = normalized.is_active;
  if (normalized.sort_order !== undefined) updates.sort_order = normalized.sort_order;

  // Slug handling: explicit wins; otherwise regenerate only if name changed.
  if (normalized.slug !== undefined) {
    updates.slug = await ensureUniqueCategorySlug(normalized.slug, id);
  } else if (normalized.name !== undefined && normalized.name !== existing.name) {
    const baseSlug = slugify(normalized.name);
    if (!isValidSlug(baseSlug)) {
      throw httpError(400, 'INVALID_CATEGORY_SLUG', 'Category slug is invalid');
    }
    updates.slug = await ensureUniqueCategorySlug(baseSlug, id);
  }

  if (Object.keys(updates).length === 0) {
    return existing;
  }

  try {
    await db('categories').where({ id }).update(updates);
  } catch (error) {
    if (error && (error.code === 'ER_DUP_ENTRY' || error.errno === 1062)) {
      throw httpError(409, 'CATEGORY_CONFLICT', 'Category name or slug already exists');
    }
    throw error;
  }

  return getCategoryById(id);
}

async function deleteCategory(id) {
  await getCategoryById(id);

  try {
    const deleted = await db('categories').where({ id }).delete();
    if (deleted === 0) {
      throw httpError(404, 'CATEGORY_NOT_FOUND', 'Category not found');
    }
  } catch (error) {
    if (error && (error.code === 'ER_ROW_IS_REFERENCED_2' || error.errno === 1451)) {
      throw httpError(409, 'CATEGORY_IN_USE', 'Category is referenced by posts and cannot be deleted');
    }
    throw error;
  }
}

module.exports = {
  listCategories,
  getCategoryById,
  getCategoryBySlug,
  createCategory,
  updateCategory,
  deleteCategory,
  normalizeCategoryInput,
};
