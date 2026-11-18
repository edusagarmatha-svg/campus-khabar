const db = require('../db/knex');
const { httpError } = require('../utils/errors');
const { slugify, isValidSlug } = require('../utils/slug');
const categoryService = require('./categoryService');

const POST_TITLE_MAX = 255;
const POST_SLUG_MAX = 255;
const POST_SUMMARY_MAX = 500;
const VALID_POST_TYPES = ['news', 'article', 'notice', 'announcement'];
const VALID_STATUSES = ['draft', 'published', 'unpublished'];
const VALID_USAGE_TYPES = ['gallery', 'inline', 'attachment'];

function toPublicPost(row) {
  if (!row) return null;
  let content = row.content;
  if (typeof content === 'string') {
    try {
      content = JSON.parse(content);
    } catch (e) {
      content = null;
    }
  }
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    content,
    post_type: row.post_type,
    category_id: row.category_id,
    author_id: row.author_id,
    cover_media_id: row.cover_media_id,
    status: row.status,
    is_featured: Boolean(row.is_featured),
    published_at: row.published_at,
    expires_at: row.expires_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
  };
}

function validateContent(content) {
  if (typeof content !== 'object' || content === null || Array.isArray(content)) {
    throw httpError(400, 'INVALID_CONTENT', 'Post content must be a TipTap JSON object');
  }
  if (content.type !== 'doc') {
    throw httpError(400, 'INVALID_CONTENT', 'Post content must be a TipTap doc');
  }
  if (!Array.isArray(content.content)) {
    throw httpError(400, 'INVALID_CONTENT', 'Post content.content must be an array');
  }
  const serialized = JSON.stringify(content);
  if (serialized.length > 1_000_000) {
    throw httpError(413, 'CONTENT_TOO_LARGE', 'Post content exceeds maximum size');
  }
}

function collectMediaIds(node, out = new Set()) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach((n) => collectMediaIds(n, out));
    return out;
  }
  if (node.attrs && typeof node.attrs === 'object') {
    if (node.attrs.mediaId !== undefined && node.attrs.mediaId !== null) {
      const id = Number(node.attrs.mediaId);
      if (Number.isInteger(id) && id > 0) out.add(id);
    }
    if (node.attrs.media_id !== undefined && node.attrs.media_id !== null) {
      const id = Number(node.attrs.media_id);
      if (Number.isInteger(id) && id > 0) out.add(id);
    }
  }
  if (Array.isArray(node.content)) {
    node.content.forEach((n) => collectMediaIds(n, out));
  }
  return out;
}

function normalizePostInput(input = {}, { partial = false } = {}) {
  const out = {};

  if (!partial || input.title !== undefined) {
    if (input.title !== undefined) {
      const title = String(input.title).trim();
      if (title.length < 1 || title.length > POST_TITLE_MAX) {
        throw httpError(400, 'INVALID_TITLE', `Title must be 1-${POST_TITLE_MAX} characters`);
      }
      out.title = title;
    } else if (!partial) {
      throw httpError(400, 'INVALID_TITLE', 'Title is required');
    }
  }

  if (input.slug !== undefined && input.slug !== null && String(input.slug).trim() !== '') {
    const slug = slugify(input.slug);
    if (!isValidSlug(slug)) {
      throw httpError(400, 'INVALID_SLUG', 'Post slug is invalid');
    }
    out.slug = slug.slice(0, POST_SLUG_MAX);
  }

  if (input.summary !== undefined) {
    if (input.summary === null || String(input.summary).trim() === '') {
      out.summary = null;
    } else {
      const summary = String(input.summary).trim();
      if (summary.length > POST_SUMMARY_MAX) {
        throw httpError(400, 'INVALID_SUMMARY', `Summary must be at most ${POST_SUMMARY_MAX} characters`);
      }
      out.summary = summary;
    }
  }

  if (input.content !== undefined) {
    validateContent(input.content);
    out.content = input.content;
  } else if (!partial) {
    throw httpError(400, 'INVALID_CONTENT', 'Content is required');
  }

  if (input.post_type !== undefined) {
    if (!VALID_POST_TYPES.includes(input.post_type)) {
      throw httpError(400, 'INVALID_POST_TYPE', 'Invalid post type');
    }
    out.post_type = input.post_type;
  } else if (!partial) {
    throw httpError(400, 'INVALID_POST_TYPE', 'post_type is required');
  }

  if (input.category_id !== undefined) {
    const categoryId = Number(input.category_id);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      throw httpError(400, 'INVALID_CATEGORY', 'category_id must be a positive integer');
    }
    out.category_id = categoryId;
  } else if (!partial) {
    throw httpError(400, 'INVALID_CATEGORY', 'category_id is required');
  }

  if (input.cover_media_id !== undefined) {
    if (input.cover_media_id === null || input.cover_media_id === '') {
      out.cover_media_id = null;
    } else {
      const mediaId = Number(input.cover_media_id);
      if (!Number.isInteger(mediaId) || mediaId <= 0) {
        throw httpError(400, 'INVALID_MEDIA', 'cover_media_id must be a positive integer');
      }
      out.cover_media_id = mediaId;
    }
  }

  if (input.status !== undefined) {
    if (!VALID_STATUSES.includes(input.status)) {
      throw httpError(400, 'INVALID_STATUS', 'Invalid status');
    }
    out.status = input.status;
  }

  if (input.is_featured !== undefined) {
    out.is_featured = Boolean(input.is_featured);
  }

  if (input.published_at !== undefined) {
    out.published_at = input.published_at === null || input.published_at === ''
      ? null
      : new Date(input.published_at);
    if (out.published_at && Number.isNaN(out.published_at.getTime())) {
      throw httpError(400, 'INVALID_PUBLISHED_AT', 'published_at must be a valid datetime');
    }
  }

  if (input.expires_at !== undefined) {
    out.expires_at = input.expires_at === null || input.expires_at === ''
      ? null
      : new Date(input.expires_at);
    if (out.expires_at && Number.isNaN(out.expires_at.getTime())) {
      throw httpError(400, 'INVALID_EXPIRES_AT', 'expires_at must be a valid datetime');
    }
  }

  if (input.media !== undefined) {
    if (!Array.isArray(input.media)) {
      throw httpError(400, 'INVALID_MEDIA_LIST', 'media must be an array');
    }
    const links = input.media.map((m) => {
      const mediaId = Number(m && m.media_id);
      if (!Number.isInteger(mediaId) || mediaId <= 0) {
        throw httpError(400, 'INVALID_MEDIA', 'media_id must be a positive integer');
      }
      const usageType = m.usage_type || 'inline';
      if (!VALID_USAGE_TYPES.includes(usageType)) {
        throw httpError(400, 'INVALID_USAGE_TYPE', 'Invalid usage_type');
      }
      const sortOrder = m.sort_order === undefined ? 0 : Number(m.sort_order);
      if (!Number.isInteger(sortOrder)) {
        throw httpError(400, 'INVALID_SORT_ORDER', 'sort_order must be an integer');
      }
      return { media_id: mediaId, usage_type: usageType, sort_order: sortOrder };
    });
    out.media = links;
  }

  return out;
}

async function ensureUniquePostSlug(baseSlug, excludeId = null) {
  let candidate = baseSlug || 'post';
  let suffix = 2;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let query = db('posts').where({ slug: candidate });
    if (excludeId !== null) {
      query = query.whereNot({ id: excludeId });
    }
    const existing = await query.first();
    if (!existing) {
      return candidate;
    }
    candidate = `${baseSlug}-${suffix}`.slice(0, POST_SLUG_MAX);
    suffix += 1;
    if (suffix > 1000) {
      throw httpError(409, 'SLUG_UNAVAILABLE', 'Unable to generate a unique post slug');
    }
  }
}

async function validateMediaExists(mediaId, expectedType = null) {
  const media = await db('media').where({ id: mediaId }).first();
  if (!media) {
    throw httpError(400, 'MEDIA_NOT_FOUND', 'Referenced media does not exist');
  }
  if (expectedType && media.media_type !== expectedType) {
    throw httpError(400, 'INVALID_MEDIA_TYPE', `Media must be of type ${expectedType}`);
  }
  return media;
}

function validateExpiry(publishedAt, expiresAt) {
  if (publishedAt && expiresAt && new Date(expiresAt) <= new Date(publishedAt)) {
    throw httpError(400, 'INVALID_EXPIRY', 'expires_at must be after published_at');
  }
}

function canManagePost(user, post) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'editor' && Number(post.author_id) === Number(user.id)) return true;
  return false;
}

async function listPublicPosts(filters = {}, pagination = {}) {
  const page = Math.max(1, Number(pagination.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(pagination.limit) || 20));
  const offset = (page - 1) * limit;

  let query = db('posts')
    .where({ status: 'published' })
    .whereNull('deleted_at')
    .where((qb) => {
      qb.whereNull('expires_at').orWhere('expires_at', '>', new Date());
    });

  if (filters.post_type) query = query.where({ post_type: filters.post_type });
  if (filters.category) {
    const cat = Number(filters.category);
    if (Number.isInteger(cat) && cat > 0) {
      query = query.where({ category_id: cat });
    } else {
      const category = await db('categories').where({ slug: String(filters.category) }).first();
      if (category) query = query.where({ category_id: category.id });
      else query = query.whereRaw('1 = 0');
    }
  }
  if (filters.featured !== undefined) {
    query = query.where({ is_featured: Boolean(filters.featured) });
  }
  if (filters.q) {
    const term = `%${String(filters.q).trim()}%`;
    query = query.where((qb) => {
      qb.where('title', 'like', term).orWhere('summary', 'like', term);
    });
  }

  const countQuery = query.clone().clearSelect().count({ total: '*' }).first();
  const { total } = await countQuery;

  let rowsQuery = query.clone().orderBy('published_at', 'desc').orderBy('id', 'desc').limit(limit).offset(offset);
  if (filters.sort === 'featured') {
    rowsQuery = query.clone().orderBy('is_featured', 'desc').orderBy('published_at', 'desc').limit(limit).offset(offset);
  }

  const rows = await rowsQuery;
  return {
    data: rows.map(toPublicPost),
    pagination: { page, limit, total: Number(total) || 0 },
  };
}

async function getPublicPostBySlug(slug) {
  const row = await db('posts')
    .where({ slug, status: 'published' })
    .whereNull('deleted_at')
    .where((qb) => {
      qb.whereNull('expires_at').orWhere('expires_at', '>', new Date());
    })
    .first();
  if (!row) {
    throw httpError(404, 'POST_NOT_FOUND', 'Post not found');
  }
  return toPublicPost(row);
}

async function listManagedPosts(user, filters = {}, pagination = {}) {
  const page = Math.max(1, Number(pagination.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(pagination.limit) || 20));
  const offset = (page - 1) * limit;

  let query = db('posts');

  if (user.role !== 'admin') {
    query = query.where({ author_id: user.id });
  } else if (filters.author) {
    const authorId = Number(filters.author);
    if (Number.isInteger(authorId) && authorId > 0) {
      query = query.where({ author_id: authorId });
    }
  }

  if (filters.status) query = query.where({ status: filters.status });
  if (filters.post_type) query = query.where({ post_type: filters.post_type });
  if (filters.category) {
    const cat = Number(filters.category);
    if (Number.isInteger(cat) && cat > 0) query = query.where({ category_id: cat });
  }
  if (filters.include_deleted === true || filters.include_deleted === 'true') {
    // admin only; already gated by role above
  } else {
    query = query.whereNull('deleted_at');
  }
  // non-admin cannot include deleted (already excluded by whereNull above? allow admin toggle)
  if (user.role !== 'admin') {
    query = query.whereNull('deleted_at');
  }

  const countQuery = query.clone().clearSelect().count({ total: '*' }).first();
  const { total } = await countQuery;

  const rows = await query.clone().orderBy('created_at', 'desc').orderBy('id', 'desc').limit(limit).offset(offset);
  return {
    data: rows.map(toPublicPost),
    pagination: { page, limit, total: Number(total) || 0 },
  };
}

async function getManagedPostById(user, id) {
  const postId = Number(id);
  if (!Number.isInteger(postId) || postId <= 0) {
    throw httpError(400, 'INVALID_POST_ID', 'Invalid post id');
  }
  const row = await db('posts').where({ id: postId }).first();
  if (!row) {
    throw httpError(404, 'POST_NOT_FOUND', 'Post not found');
  }
  if (!canManagePost(user, row)) {
    throw httpError(403, 'FORBIDDEN', 'Insufficient permissions');
  }
  return toPublicPost(row);
}

async function createPost(user, input) {
  const normalized = normalizePostInput(input || {}, { partial: false });

  // category exists
  await categoryService.getCategoryById(normalized.category_id);

  if (normalized.cover_media_id) {
    await validateMediaExists(normalized.cover_media_id, 'image');
  }

  const baseSlug = normalized.slug || slugify(normalized.title);
  if (!isValidSlug(baseSlug)) {
    throw httpError(400, 'INVALID_SLUG', 'Post slug is invalid');
  }
  const slug = await ensureUniquePostSlug(baseSlug);

  let status = normalized.status || 'draft';
  let publishedAt = normalized.published_at || null;
  if (status === 'published' && !publishedAt) {
    publishedAt = new Date();
  }
  validateExpiry(publishedAt, normalized.expires_at);

  // content media integrity
  const contentMediaIds = collectMediaIds(normalized.content);
  const providedMediaIds = new Set((normalized.media || []).map((m) => m.media_id));
  for (const id of contentMediaIds) {
    if (!providedMediaIds.has(id)) {
      throw httpError(400, 'CONTENT_MEDIA_MISSING', 'Media referenced in content must be linked via media list');
    }
    await validateMediaExists(id);
  }
  for (const link of normalized.media || []) {
    await validateMediaExists(link.media_id);
  }

  const now = new Date();
  let postId;
  await db.transaction(async (trx) => {
    const [insertedId] = await trx('posts').insert({
      title: normalized.title,
      slug,
      summary: normalized.summary === undefined ? null : normalized.summary,
      content: normalized.content,
      post_type: normalized.post_type,
      category_id: normalized.category_id,
      author_id: user.id,
      cover_media_id: normalized.cover_media_id === undefined ? null : normalized.cover_media_id,
      status,
      is_featured: normalized.is_featured === undefined ? false : normalized.is_featured,
      published_at: publishedAt,
      expires_at: normalized.expires_at === undefined ? null : normalized.expires_at,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    });
    postId = insertedId;

    if (normalized.media && normalized.media.length > 0) {
      await trx('post_media').insert(
        normalized.media.map((m) => ({
          post_id: postId,
          media_id: m.media_id,
          usage_type: m.usage_type,
          sort_order: m.sort_order,
        })),
      );
    }
  });

  return getManagedPostById(user, postId);
}

async function updatePost(user, id, input) {
  const postId = Number(id);
  if (!Number.isInteger(postId) || postId <= 0) {
    throw httpError(400, 'INVALID_POST_ID', 'Invalid post id');
  }

  const existing = await db('posts').where({ id: postId }).first();
  if (!existing) {
    throw httpError(404, 'POST_NOT_FOUND', 'Post not found');
  }
  if (!canManagePost(user, existing)) {
    throw httpError(403, 'FORBIDDEN', 'Insufficient permissions');
  }

  const normalized = normalizePostInput(input || {}, { partial: true });

  if (normalized.category_id !== undefined) {
    await categoryService.getCategoryById(normalized.category_id);
  }
  if (normalized.cover_media_id !== undefined && normalized.cover_media_id !== null) {
    await validateMediaExists(normalized.cover_media_id, 'image');
  }

  // slug handling
  let newSlug;
  if (normalized.slug !== undefined) {
    newSlug = await ensureUniquePostSlug(normalized.slug, postId);
  } else if (normalized.title !== undefined && normalized.title !== existing.title) {
    // keep slug stable unless title changed? We regenerate only if title changed.
    const baseSlug = slugify(normalized.title);
    if (isValidSlug(baseSlug)) {
      newSlug = await ensureUniquePostSlug(baseSlug, postId);
    }
  }

  // status transition
  let status = normalized.status !== undefined ? normalized.status : existing.status;
  let publishedAt = normalized.published_at !== undefined ? normalized.published_at : existing.published_at;
  if (normalized.status === 'published' && !publishedAt) {
    publishedAt = new Date();
  }
  const expiresAt = normalized.expires_at !== undefined ? normalized.expires_at : existing.expires_at;
  validateExpiry(publishedAt, expiresAt);

  // content media integrity
  if (normalized.content !== undefined) {
    const contentMediaIds = collectMediaIds(normalized.content);
    // media list may be provided; otherwise use existing post_media
    let providedMediaIds;
    if (normalized.media !== undefined) {
      providedMediaIds = new Set(normalized.media.map((m) => m.media_id));
    } else {
      const existingLinks = await db('post_media').where({ post_id: postId }).select('media_id');
      providedMediaIds = new Set(existingLinks.map((r) => Number(r.media_id)));
    }
    for (const id of contentMediaIds) {
      if (!providedMediaIds.has(id)) {
        throw httpError(400, 'CONTENT_MEDIA_MISSING', 'Media referenced in content must be linked via media list');
      }
      await validateMediaExists(id);
    }
  }
  if (normalized.media !== undefined) {
    for (const link of normalized.media) {
      await validateMediaExists(link.media_id);
    }
  }

  const updates = {};
  if (normalized.title !== undefined) updates.title = normalized.title;
  if (newSlug !== undefined) updates.slug = newSlug;
  if (normalized.summary !== undefined) updates.summary = normalized.summary;
  if (normalized.content !== undefined) updates.content = normalized.content;
  if (normalized.post_type !== undefined) updates.post_type = normalized.post_type;
  if (normalized.category_id !== undefined) updates.category_id = normalized.category_id;
  if (normalized.cover_media_id !== undefined) updates.cover_media_id = normalized.cover_media_id;
  if (normalized.status !== undefined || status !== existing.status) updates.status = status;
  if (normalized.is_featured !== undefined) updates.is_featured = normalized.is_featured;
  if (normalized.published_at !== undefined || (normalized.status === 'published' && !existing.published_at)) {
    updates.published_at = publishedAt;
  }
  if (normalized.expires_at !== undefined) updates.expires_at = expiresAt;
  updates.updated_at = new Date();

  // If status changed to published and publishedAt set above, ensure included
  if (status === 'published' && !existing.published_at && updates.published_at === undefined) {
    updates.published_at = new Date();
  }

  await db.transaction(async (trx) => {
    if (Object.keys(updates).length > 0) {
      await trx('posts').where({ id: postId }).update(updates);
    }
    if (normalized.media !== undefined) {
      await trx('post_media').where({ post_id: postId }).delete();
      if (normalized.media.length > 0) {
        await trx('post_media').insert(
          normalized.media.map((m) => ({
            post_id: postId,
            media_id: m.media_id,
            usage_type: m.usage_type,
            sort_order: m.sort_order,
          })),
        );
      }
    }
  });

  return getManagedPostById(user, postId);
}

async function softDeletePost(user, id) {
  const postId = Number(id);
  if (!Number.isInteger(postId) || postId <= 0) {
    throw httpError(400, 'INVALID_POST_ID', 'Invalid post id');
  }
  const existing = await db('posts').where({ id: postId }).first();
  if (!existing) {
    throw httpError(404, 'POST_NOT_FOUND', 'Post not found');
  }
  if (!canManagePost(user, existing)) {
    throw httpError(403, 'FORBIDDEN', 'Insufficient permissions');
  }
  if (existing.deleted_at) {
    return toPublicPost(existing);
  }

  const newSlug = `${existing.slug}--deleted-${postId}`.slice(0, POST_SLUG_MAX);

  await db('posts').where({ id: postId }).update({
    deleted_at: new Date(),
    slug: newSlug,
    updated_at: new Date(),
  });

  const updated = await db('posts').where({ id: postId }).first();
  return toPublicPost(updated);
}

module.exports = {
  toPublicPost,
  validateContent,
  collectMediaIds,
  normalizePostInput,
  listPublicPosts,
  getPublicPostBySlug,
  listManagedPosts,
  getManagedPostById,
  createPost,
  updatePost,
  softDeletePost,
  canManagePost,
};
