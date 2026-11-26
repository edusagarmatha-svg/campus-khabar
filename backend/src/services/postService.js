const db = require('../db/knex');
const { httpError } = require('../utils/errors');
const { slugify, isValidSlug } = require('../utils/slug');
const categoryService = require('./categoryService');
const mediaService = require('./mediaService');

const POST_TITLE_MAX = 255;
const POST_SLUG_MAX = 255;
const POST_SUMMARY_MAX = 500;
const REVIEW_FEEDBACK_MAX = 4000;
const VALID_POST_TYPES = ['news', 'article', 'notice', 'announcement'];
const VALID_STATUSES = [
  'draft',
  'pending_review',
  'changes_requested',
  'published',
  'unpublished',
];
const VALID_REVISION_STATUSES = [
  'pending_review',
  'changes_requested',
  'applied',
  'discarded',
];
const VALID_USAGE_TYPES = ['gallery', 'inline', 'attachment'];

// Statuses an editor can never set directly; they are reached only through the
// review endpoints, which enforce the transitions.
const EDITOR_FORBIDDEN_STATUSES = ['published', 'unpublished', 'pending_review'];
// Statuses in which an editor may still edit their own post.
const EDITOR_EDITABLE_STATUSES = ['draft', 'changes_requested'];
// Post statuses eligible to submit (or resubmit) for review.
const SUBMITTABLE_POST_STATUSES = ['draft', 'changes_requested'];
const OPEN_REVISION_STATUSES = ['pending_review', 'changes_requested'];

function normaliseContent(content) {
  if (typeof content === 'string') {
    try {
      return JSON.parse(content);
    } catch (e) {
      return null;
    }
  }
  return content === undefined ? null : content;
}

function toPublicPost(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    content: normaliseContent(row.content),
    post_type: row.post_type,
    category_id: row.category_id,
    author_id: row.author_id,
    cover_media_id: row.cover_media_id,
    cover_image: row.cover_url
      ? {
          id: row.cover_id || row.cover_media_id,
          file_url: row.cover_url,
          alt_text: row.cover_alt_text || null,
          width: row.cover_width || null,
          height: row.cover_height || null,
          file_name: row.cover_file_name || null,
        }
      : null,
    status: row.status,
    is_featured: Boolean(row.is_featured),
    published_at: row.published_at,
    expires_at: row.expires_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
  };
}

/**
 * Review metadata is only ever returned by staff endpoints; public endpoints
 * keep using toPublicPost so feedback never leaks to the portal.
 */
function toManagedPost(row) {
  if (!row) return null;
  return {
    ...toPublicPost(row),
    submitted_at: row.submitted_at || null,
    review_feedback: row.review_feedback || null,
    reviewed_by: row.reviewed_by || null,
    reviewed_at: row.reviewed_at || null,
    author: row.author_name
      ? { id: row.author_id, name: row.author_name }
      : undefined,
  };
}

function toManagedRevision(row) {
  if (!row) return null;
  return {
    id: row.id,
    post_id: row.post_id,
    author_id: row.author_id,
    author: row.author_name ? { id: row.author_id, name: row.author_name } : undefined,
    title: row.title,
    slug: row.slug || null,
    summary: row.summary,
    content: normaliseContent(row.content),
    post_type: row.post_type,
    category_id: row.category_id,
    cover_media_id: row.cover_media_id,
    status: row.status,
    review_feedback: row.review_feedback || null,
    submitted_at: row.submitted_at,
    reviewed_by: row.reviewed_by || null,
    reviewed_at: row.reviewed_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
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

/**
 * Media referenced by a revision must be usable by its author: either uploaded
 * by that editor, already attached to the post being revised, or managed by an
 * admin. This keeps editors from borrowing another staff member's assets.
 */
async function validateRevisionMediaAccess(user, mediaId, postId) {
  const media = await validateMediaExists(mediaId);
  if (user.role === 'admin') return media;
  if (Number(media.uploaded_by) === Number(user.id)) return media;

  const attachedToPost = await db('post_media')
    .where({ post_id: postId, media_id: mediaId })
    .first();
  if (attachedToPost) return media;

  const isCover = await db('posts')
    .where({ id: postId, cover_media_id: mediaId })
    .first();
  if (isCover) return media;

  throw httpError(
    403,
    'MEDIA_NOT_OWNED',
    'Media belongs to another staff member and cannot be used in this revision',
  );
}

function validateExpiry(publishedAt, expiresAt) {
  if (publishedAt && expiresAt && new Date(expiresAt) <= new Date(publishedAt)) {
    throw httpError(400, 'INVALID_EXPIRY', 'expires_at must be after published_at');
  }
}

function validateFeedback(feedback) {
  if (typeof feedback !== 'string' || feedback.trim().length === 0) {
    throw httpError(400, 'INVALID_FEEDBACK', 'feedback is required');
  }
  const trimmed = feedback.trim();
  if (trimmed.length > REVIEW_FEEDBACK_MAX) {
    throw httpError(
      400,
      'INVALID_FEEDBACK',
      `feedback must be at most ${REVIEW_FEEDBACK_MAX} characters`,
    );
  }
  return trimmed;
}

function canManagePost(user, post) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'editor' && Number(post.author_id) === Number(user.id)) return true;
  return false;
}

function parseDate(value) {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

// --- Public reads ---------------------------------------------------------

async function listPublicPosts(filters = {}, pagination = {}) {
  const page = Math.max(1, Number(pagination.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(pagination.limit) || 20));
  const offset = (page - 1) * limit;

  // Only approved, published posts are public. Drafts, submissions awaiting
  // review, returned submissions and unpublished posts never match this filter.
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

  let rowsQuery = query
    .clone()
    .leftJoin('media as cover_media', 'posts.cover_media_id', 'cover_media.id')
    .select(
      'posts.*',
      'cover_media.id as cover_id',
      'cover_media.file_url as cover_url',
      'cover_media.alt_text as cover_alt_text',
      'cover_media.width as cover_width',
      'cover_media.height as cover_height',
      'cover_media.file_name as cover_file_name',
    )
    .orderBy('posts.published_at', 'desc')
    .orderBy('posts.id', 'desc')
    .limit(limit)
    .offset(offset);
  if (filters.sort === 'featured') {
    rowsQuery = query
      .clone()
      .leftJoin('media as cover_media', 'posts.cover_media_id', 'cover_media.id')
      .select(
        'posts.*',
        'cover_media.id as cover_id',
        'cover_media.file_url as cover_url',
        'cover_media.alt_text as cover_alt_text',
        'cover_media.width as cover_width',
        'cover_media.height as cover_height',
        'cover_media.file_name as cover_file_name',
      )
      .orderBy('is_featured', 'desc')
      .orderBy('posts.published_at', 'desc')
      .limit(limit)
      .offset(offset);
  }

  const rows = await rowsQuery;
  return {
    data: rows.map(toPublicPost),
    pagination: { page, limit, total: Number(total) || 0 },
  };
}

async function getPublicPostBySlug(slug) {
  const row = await db('posts')
    .leftJoin('media as cover_media', 'posts.cover_media_id', 'cover_media.id')
    .select(
      'posts.*',
      'cover_media.id as cover_id',
      'cover_media.file_url as cover_url',
      'cover_media.alt_text as cover_alt_text',
      'cover_media.width as cover_width',
      'cover_media.height as cover_height',
      'cover_media.file_name as cover_file_name',
    )
    .where({ 'posts.slug': slug, 'posts.status': 'published' })
    .whereNull('posts.deleted_at')
    .where((qb) => {
      qb.whereNull('posts.expires_at').orWhere('posts.expires_at', '>', new Date());
    })
    .first();
  if (!row) {
    throw httpError(404, 'POST_NOT_FOUND', 'Post not found');
  }
  const post = toPublicPost(row);
  post.attachments = await loadPostAttachments(row.id);
  return post;
}

// --- Managed reads --------------------------------------------------------

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
  if (user.role !== 'admin') {
    query = query.whereNull('deleted_at');
  }

  const countQuery = query.clone().clearSelect().count({ total: '*' }).first();
  const { total } = await countQuery;

  const rows = await query.clone().orderBy('created_at', 'desc').orderBy('id', 'desc').limit(limit).offset(offset);
  return {
    data: rows.map(toManagedPost),
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
  const post = toManagedPost(row);
  post.media = await listPostMedia(postId);
  post.attachments = await loadPostAttachments(postId);
  return post;
}

// --- Post writes ----------------------------------------------------------

async function createPost(user, input) {
  const normalized = normalizePostInput(input || {}, { partial: false });

  if (user.role !== 'admin' && normalized.status && normalized.status !== 'draft') {
    throw httpError(
      403,
      'FORBIDDEN',
      'Editors can only create drafts; submit the post for review instead',
    );
  }

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

  const status = normalized.status || 'draft';
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
      submitted_at: status === 'pending_review' ? now : null,
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

  if (user.role !== 'admin') {
    if (existing.status === 'published') {
      throw httpError(
        409,
        'REVISION_REQUIRED',
        'Published posts cannot be edited directly; propose changes instead',
      );
    }
    if (!EDITOR_EDITABLE_STATUSES.includes(existing.status)) {
      throw httpError(
        409,
        'POST_LOCKED',
        `Posts in "${existing.status}" cannot be edited`,
      );
    }
    if (normalized.status !== undefined && normalized.status !== existing.status) {
      throw httpError(
        403,
        'FORBIDDEN',
        'Editors cannot change post status; submit the post for review instead',
      );
    }
  }

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
  // Knex does not serialise objects for UPDATE on a JSON column, so the value
  // is stringified explicitly here.
  if (normalized.content !== undefined) updates.content = JSON.stringify(normalized.content);
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

  // An admin moving a post back into the review queue needs a submission time.
  if (status === 'pending_review' && existing.status !== 'pending_review' && !updates.submitted_at) {
    updates.submitted_at = new Date();
  }
  // Approving or returning a post clears the pending revision pointer.
  if (status === 'published' && existing.status !== 'published') {
    updates.review_feedback = null;
    updates.reviewed_by = user.role === 'admin' ? user.id : null;
    updates.reviewed_at = new Date();
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
    return toManagedPost(existing);
  }

  const newSlug = `${existing.slug}--deleted-${postId}`.slice(0, POST_SLUG_MAX);

  await db('posts').where({ id: postId }).update({
    deleted_at: new Date(),
    slug: newSlug,
    updated_at: new Date(),
  });

  const updated = await db('posts').where({ id: postId }).first();
  return toManagedPost(updated);
}

// --- Review transitions (posts) ------------------------------------------

async function lockPost(trx, postId) {
  const row = await trx('posts').where({ id: postId }).forUpdate().first();
  if (!row) {
    throw httpError(404, 'POST_NOT_FOUND', 'Post not found');
  }
  if (row.deleted_at) {
    throw httpError(409, 'POST_DELETED', 'Deleted posts cannot be reviewed');
  }
  return row;
}

async function submitPostForReview(user, id) {
  const postId = Number(id);

  await db.transaction(async (trx) => {
    const post = await lockPost(trx, postId);
    if (!canManagePost(user, post)) {
      throw httpError(403, 'FORBIDDEN', 'Insufficient permissions');
    }
    if (!SUBMITTABLE_POST_STATUSES.includes(post.status)) {
      throw httpError(
        409,
        'INVALID_STATUS_TRANSITION',
        `A post in "${post.status}" cannot be submitted for review`,
      );
    }

    const now = new Date();
    await trx('posts').where({ id: postId }).update({
      status: 'pending_review',
      submitted_at: now,
      review_feedback: null,
      reviewed_by: null,
      reviewed_at: null,
      updated_at: now,
    });
  });

  return getManagedPostById(user, postId);
}

async function approvePost(user, id) {
  if (!user || user.role !== 'admin') {
    throw httpError(403, 'FORBIDDEN', 'Only admins can approve posts');
  }
  const postId = Number(id);

  await db.transaction(async (trx) => {
    const post = await lockPost(trx, postId);
    if (post.status !== 'pending_review') {
      throw httpError(
        409,
        'INVALID_STATUS_TRANSITION',
        `Only posts awaiting review can be approved; this post is "${post.status}"`,
      );
    }

    const now = new Date();
    const publishedAt = parseDate(post.published_at) || now;
    validateExpiry(publishedAt, parseDate(post.expires_at));

    await trx('posts').where({ id: postId }).update({
      status: 'published',
      published_at: publishedAt,
      review_feedback: null,
      reviewed_by: user.id,
      reviewed_at: now,
      updated_at: now,
    });
  });

  return getManagedPostById(user, postId);
}

async function requestPostChanges(user, id, feedback) {
  if (!user || user.role !== 'admin') {
    throw httpError(403, 'FORBIDDEN', 'Only admins can request changes');
  }
  const postId = Number(id);
  const trimmed = validateFeedback(feedback);

  await db.transaction(async (trx) => {
    const post = await lockPost(trx, postId);
    if (post.status !== 'pending_review') {
      throw httpError(
        409,
        'INVALID_STATUS_TRANSITION',
        `Only posts awaiting review can be returned; this post is "${post.status}"`,
      );
    }

    const now = new Date();
    // Only workflow metadata changes: the post body, slug and publication state
    // stay exactly as the editor left them.
    await trx('posts').where({ id: postId }).update({
      status: 'changes_requested',
      review_feedback: trimmed,
      reviewed_by: user.id,
      reviewed_at: now,
      updated_at: now,
    });
  });

  return getManagedPostById(user, postId);
}

async function getReviewQueue(user, pagination = {}) {
  if (!user || user.role !== 'admin') {
    throw httpError(403, 'FORBIDDEN', 'Admin only');
  }
  const page = Math.max(1, Number(pagination.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(pagination.limit) || 20));

  const postRows = await db('posts as p')
    .leftJoin('users as author', 'p.author_id', 'author.id')
    .select(
      'p.id',
      'p.slug',
      'p.title',
      'p.status',
      'p.submitted_at',
      'p.review_feedback',
      'p.author_id',
      'author.name as author_name',
    )
    .where({ 'p.status': 'pending_review' })
    .whereNull('p.deleted_at')
    .orderBy('p.submitted_at', 'asc');

  const revisionRows = await db('post_revisions as r')
    .leftJoin('users as author', 'r.author_id', 'author.id')
    .leftJoin('posts as p', 'r.post_id', 'p.id')
    .select(
      'r.id',
      'r.post_id',
      'r.title',
      'r.status',
      'r.submitted_at',
      'r.review_feedback',
      'r.author_id',
      'author.name as author_name',
      'p.slug as post_slug',
      'p.status as post_status',
    )
    .where({ 'r.status': 'pending_review' })
    .orderBy('r.submitted_at', 'asc');

  const items = [
    ...postRows.map((row) => ({
      item_type: 'post',
      id: row.id,
      post_id: row.id,
      post_slug: row.slug,
      post_status: row.status,
      title: row.title,
      status: row.status,
      review_feedback: row.review_feedback || null,
      submitted_at: row.submitted_at,
      author: { id: row.author_id, name: row.author_name },
    })),
    ...revisionRows.map((row) => ({
      item_type: 'revision',
      id: row.id,
      post_id: row.post_id,
      post_slug: row.post_slug,
      post_status: row.post_status,
      title: row.title,
      status: row.status,
      review_feedback: row.review_feedback || null,
      submitted_at: row.submitted_at,
      author: { id: row.author_id, name: row.author_name },
    })),
  ].sort((a, b) => new Date(a.submitted_at || 0) - new Date(b.submitted_at || 0));

  const offset = (page - 1) * limit;
  return {
    data: items.slice(offset, offset + limit),
    pagination: { page, limit, total: items.length },
    counts: {
      posts: postRows.length,
      revisions: revisionRows.length,
      total: items.length,
    },
  };
}

// --- Revisions ------------------------------------------------------------

async function getRevisionRow(user, revisionId) {
  const id = Number(revisionId);
  if (!Number.isInteger(id) || id <= 0) {
    throw httpError(400, 'INVALID_REVISION_ID', 'Invalid revision id');
  }
  const row = await db('post_revisions as r')
    .leftJoin('users as author', 'r.author_id', 'author.id')
    .select('r.*', 'author.name as author_name')
    .where('r.id', id)
    .first();
  if (!row) {
    throw httpError(404, 'REVISION_NOT_FOUND', 'Revision not found');
  }
  if (!canManagePost(user, { author_id: row.author_id })) {
    throw httpError(403, 'FORBIDDEN', 'Insufficient permissions');
  }
  return row;
}

async function listRevisionMedia(revisionId) {
  const rows = await db('post_revision_media')
    .where({ revision_id: revisionId })
    .orderBy('sort_order', 'asc');
  return rows.map((r) => ({
    media_id: r.media_id,
    usage_type: r.usage_type,
    sort_order: r.sort_order,
  }));
}

async function listPostMedia(postId) {
  const rows = await db('post_media').where({ post_id: postId }).orderBy('sort_order', 'asc');
  return rows.map((r) => ({
    media_id: r.media_id,
    usage_type: r.usage_type,
    sort_order: r.sort_order,
  }));
}

async function loadPostAttachments(postId) {
  const rows = await db('post_media')
    .join('media', 'post_media.media_id', 'media.id')
    .where({ 'post_media.post_id': postId, 'post_media.usage_type': 'attachment' })
    .orderBy('post_media.sort_order', 'asc')
    .select('media.*');
  return rows.map(mediaService.toPublicMedia);
}

async function loadRevisionAttachments(revisionId) {
  const rows = await db('post_revision_media')
    .join('media', 'post_revision_media.media_id', 'media.id')
    .where({ 'post_revision_media.revision_id': revisionId, 'post_revision_media.usage_type': 'attachment' })
    .orderBy('post_revision_media.sort_order', 'asc')
    .select('media.*');
  return rows.map(mediaService.toPublicMedia);
}

async function getRevisionById(user, revisionId) {
  const row = await getRevisionRow(user, revisionId);
  return {
    ...toManagedRevision(row),
    media: await listRevisionMedia(row.id),
    attachments: await loadRevisionAttachments(row.id),
  };
}

async function listRevisions(user, postId) {
  const id = Number(postId);
  if (!Number.isInteger(id) || id <= 0) {
    throw httpError(400, 'INVALID_POST_ID', 'Invalid post id');
  }
  const post = await db('posts').where({ id }).first();
  if (!post) {
    throw httpError(404, 'POST_NOT_FOUND', 'Post not found');
  }
  if (!canManagePost(user, post)) {
    throw httpError(403, 'FORBIDDEN', 'Insufficient permissions');
  }

  const rows = await db('post_revisions as r')
    .leftJoin('users as author', 'r.author_id', 'author.id')
    .select('r.*', 'author.name as author_name')
    .where('r.post_id', id)
    .orderBy('r.created_at', 'desc')
    .orderBy('r.id', 'desc');

  return { data: rows.map(toManagedRevision) };
}

function revisionPayloadFromPost(post, input) {
  const merged = {
    title: input.title !== undefined ? input.title : post.title,
    summary: input.summary !== undefined ? input.summary : post.summary,
    content: input.content !== undefined ? input.content : normaliseContent(post.content),
    post_type: input.post_type !== undefined ? input.post_type : post.post_type,
    category_id: input.category_id !== undefined ? input.category_id : post.category_id,
    cover_media_id:
      input.cover_media_id !== undefined ? input.cover_media_id : post.cover_media_id,
  };
  if (input.slug !== undefined) merged.slug = input.slug;
  if (input.media !== undefined) merged.media = input.media;
  return normalizePostInput(merged, { partial: false });
}

async function createRevision(user, postId, input = {}) {
  const id = Number(postId);
  if (!Number.isInteger(id) || id <= 0) {
    throw httpError(400, 'INVALID_POST_ID', 'Invalid post id');
  }

  const post = await db('posts').where({ id }).first();
  if (!post) {
    throw httpError(404, 'POST_NOT_FOUND', 'Post not found');
  }
  if (!canManagePost(user, post)) {
    throw httpError(403, 'FORBIDDEN', 'Insufficient permissions');
  }
  if (post.deleted_at) {
    throw httpError(409, 'POST_DELETED', 'Deleted posts cannot be revised');
  }
  if (post.status !== 'published') {
    throw httpError(
      409,
      'INVALID_STATUS_TRANSITION',
      'Only published posts can receive proposed changes; edit drafts directly',
    );
  }

  const open = await db('post_revisions')
    .where({ post_id: id })
    .whereIn('status', OPEN_REVISION_STATUSES)
    .first();
  if (open) {
    throw httpError(
      409,
      'REVISION_EXISTS',
      'This post already has changes waiting for review',
    );
  }

  const normalized = revisionPayloadFromPost(post, input || {});

  await categoryService.getCategoryById(normalized.category_id);

  const contentMediaIds = collectMediaIds(normalized.content);
  let mediaLinks = normalized.media;
  if (mediaLinks === undefined) {
    mediaLinks = await listRevisionMediaForPost(post.id);
  }
  const providedMediaIds = new Set(mediaLinks.map((m) => m.media_id));

  for (const mediaId of contentMediaIds) {
    if (!providedMediaIds.has(mediaId)) {
      throw httpError(
        400,
        'CONTENT_MEDIA_MISSING',
        'Media referenced in content must be linked via media list',
      );
    }
  }
  for (const link of mediaLinks) {
    await validateRevisionMediaAccess(user, link.media_id, post.id);
  }
  if (normalized.cover_media_id) {
    await validateRevisionMediaAccess(user, normalized.cover_media_id, post.id);
    const cover = await db('media').where({ id: normalized.cover_media_id }).first();
    if (cover && cover.media_type !== 'image') {
      throw httpError(400, 'INVALID_MEDIA_TYPE', 'Media must be of type image');
    }
  }

  const now = new Date();
  let revisionId;
  await db.transaction(async (trx) => {
    const [inserted] = await trx('post_revisions').insert({
      post_id: post.id,
      author_id: user.id,
      title: normalized.title,
      // Store the proposed slug explicitly so a pending revision is a complete
      // snapshot; it falls back to the live slug when the editor did not change it.
      slug: normalized.slug || post.slug,
      summary: normalized.summary === undefined ? null : normalized.summary,
      content: normalized.content,
      post_type: normalized.post_type,
      category_id: normalized.category_id,
      cover_media_id:
        normalized.cover_media_id === undefined ? null : normalized.cover_media_id,
      status: 'pending_review',
      submitted_at: now,
      created_at: now,
      updated_at: now,
    });
    revisionId = inserted;

    if (mediaLinks.length > 0) {
      await trx('post_revision_media').insert(
        mediaLinks.map((m) => ({
          revision_id: revisionId,
          media_id: m.media_id,
          usage_type: m.usage_type || 'inline',
          sort_order: m.sort_order || 0,
        })),
      );
    }
  });

  return getRevisionById(user, revisionId);
}

async function listRevisionMediaForPost(postId) {
  const rows = await db('post_media')
    .where({ post_id: postId })
    .orderBy('sort_order', 'asc');
  return rows.map((r) => ({
    media_id: r.media_id,
    usage_type: r.usage_type,
    sort_order: r.sort_order,
  }));
}

async function updateRevision(user, revisionId, input = {}) {
  const revision = await getRevisionRow(user, revisionId);
  const isAuthor = Number(revision.author_id) === Number(user.id);
  const isAdmin = user.role === 'admin';

  if (!isAdmin && !isAuthor) {
    throw httpError(403, 'FORBIDDEN', 'Insufficient permissions');
  }
  if (revision.status === 'applied' || revision.status === 'discarded') {
    throw httpError(
      409,
      'REVISION_CLOSED',
      `Revisions in "${revision.status}" state can no longer be edited`,
    );
  }
  if (!isAdmin && revision.status !== 'changes_requested') {
    throw httpError(
      409,
      'REVISION_LOCKED',
      'Changes can only be edited after an admin requests changes',
    );
  }

  const normalized = normalizePostInput(input || {}, { partial: true });

  if (normalized.category_id !== undefined) {
    await categoryService.getCategoryById(normalized.category_id);
  }

  let mediaLinks = normalized.media;
  if (mediaLinks !== undefined) {
    for (const link of mediaLinks) {
      await validateRevisionMediaAccess(user, link.media_id, revision.post_id);
    }
  }
  if (normalized.cover_media_id) {
    await validateRevisionMediaAccess(user, normalized.cover_media_id, revision.post_id);
    const cover = await db('media').where({ id: normalized.cover_media_id }).first();
    if (cover && cover.media_type !== 'image') {
      throw httpError(400, 'INVALID_MEDIA_TYPE', 'Media must be of type image');
    }
  }
  if (normalized.content !== undefined) {
    const contentMediaIds = collectMediaIds(normalized.content);
    const currentLinks = mediaLinks !== undefined
      ? new Set(mediaLinks.map((m) => m.media_id))
      : new Set((await listRevisionMedia(revision.id)).map((m) => m.media_id));
    for (const mediaId of contentMediaIds) {
      if (!currentLinks.has(mediaId)) {
        throw httpError(
          400,
          'CONTENT_MEDIA_MISSING',
          'Media referenced in content must be linked via media list',
        );
      }
    }
  }
  if (normalized.slug !== undefined) {
    const clash = await db('posts')
      .where({ slug: normalized.slug })
      .whereNot({ id: revision.post_id })
      .first();
    if (clash) {
      throw httpError(409, 'SLUG_UNAVAILABLE', 'That slug is already used by another post');
    }
  }

  const updates = {};
  for (const key of ['title', 'slug', 'summary', 'content', 'post_type', 'category_id', 'cover_media_id']) {
    if (normalized[key] === undefined) continue;
    updates[key] = key === 'content' ? JSON.stringify(normalized[key]) : normalized[key];
  }
  updates.updated_at = new Date();

  await db.transaction(async (trx) => {
    await trx('post_revisions').where({ id: revision.id }).update(updates);
    if (mediaLinks !== undefined) {
      await trx('post_revision_media').where({ revision_id: revision.id }).delete();
      if (mediaLinks.length > 0) {
        await trx('post_revision_media').insert(
          mediaLinks.map((m) => ({
            revision_id: revision.id,
            media_id: m.media_id,
            usage_type: m.usage_type || 'inline',
            sort_order: m.sort_order || 0,
          })),
        );
      }
    }
  });

  return getRevisionById(user, revision.id);
}

async function submitRevisionForReview(user, revisionId) {
  const revision = await getRevisionRow(user, revisionId);

  if (revision.status !== 'changes_requested') {
    throw httpError(
      409,
      'INVALID_STATUS_TRANSITION',
      `Only revisions with requested changes can be resubmitted; this one is "${revision.status}"`,
    );
  }

  const now = new Date();
  await db('post_revisions').where({ id: revision.id }).update({
    status: 'pending_review',
    submitted_at: now,
    review_feedback: null,
    reviewed_by: null,
    reviewed_at: null,
    updated_at: now,
  });

  return getRevisionById(user, revision.id);
}

async function requestRevisionChanges(user, revisionId, feedback) {
  if (!user || user.role !== 'admin') {
    throw httpError(403, 'FORBIDDEN', 'Only admins can request changes');
  }
  const trimmed = validateFeedback(feedback);

  await db.transaction(async (trx) => {
    const row = await trx('post_revisions').where({ id: Number(revisionId) }).forUpdate().first();
    if (!row) {
      throw httpError(404, 'REVISION_NOT_FOUND', 'Revision not found');
    }
    if (row.status !== 'pending_review') {
      throw httpError(
        409,
        'INVALID_STATUS_TRANSITION',
        `Only revisions awaiting review can be returned; this one is "${row.status}"`,
      );
    }

    const now = new Date();
    await trx('post_revisions').where({ id: row.id }).update({
      status: 'changes_requested',
      review_feedback: trimmed,
      reviewed_by: user.id,
      reviewed_at: now,
      updated_at: now,
    });
  });

  return getRevisionById(user, revisionId);
}

/**
 * Applies an approved revision to its post atomically: post fields, media
 * relationships, and the revision status all change in one transaction, so a
 * failure can never leave the post with half-applied content.
 */
async function approveRevision(user, revisionId) {
  if (!user || user.role !== 'admin') {
    throw httpError(403, 'FORBIDDEN', 'Only admins can approve revisions');
  }
  const id = Number(revisionId);

  let postId;

  await db.transaction(async (trx) => {
    const revision = await trx('post_revisions').where({ id }).forUpdate().first();
    if (!revision) {
      throw httpError(404, 'REVISION_NOT_FOUND', 'Revision not found');
    }
    if (revision.status !== 'pending_review') {
      throw httpError(
        409,
        'INVALID_STATUS_TRANSITION',
        `Only revisions awaiting review can be approved; this one is "${revision.status}"`,
      );
    }

    const post = await trx('posts').where({ id: revision.post_id }).forUpdate().first();
    if (!post) {
      throw httpError(404, 'POST_NOT_FOUND', 'Post not found');
    }
    if (post.deleted_at) {
      throw httpError(409, 'POST_DELETED', 'Deleted posts cannot receive revisions');
    }

    // Keep the public URL stable unless the revision explicitly changes it.
    let slug = post.slug;
    if (revision.slug && revision.slug !== post.slug) {
      const clash = await trx('posts')
        .where({ slug: revision.slug })
        .whereNot({ id: post.id })
        .first();
      if (clash) {
        throw httpError(409, 'SLUG_UNAVAILABLE', 'That slug is already used by another post');
      }
      slug = revision.slug;
    }

    const publishedAt = parseDate(post.published_at) || new Date();
    validateExpiry(publishedAt, parseDate(post.expires_at));

    const now = new Date();
    await trx('posts').where({ id: post.id }).update({
      title: revision.title,
      slug,
      summary: revision.summary,
      content: typeof revision.content === 'string' ? revision.content : JSON.stringify(revision.content),
      post_type: revision.post_type,
      category_id: revision.category_id,
      cover_media_id: revision.cover_media_id,
      status: post.status === 'published' ? 'published' : post.status,
      published_at: publishedAt,
      review_feedback: null,
      reviewed_by: user.id,
      reviewed_at: now,
      updated_at: now,
    });

    const revisionMedia = await trx('post_revision_media')
      .where({ revision_id: revision.id })
      .orderBy('sort_order', 'asc');

    await trx('post_media').where({ post_id: post.id }).delete();
    if (revisionMedia.length > 0) {
      await trx('post_media').insert(
        revisionMedia.map((m) => ({
          post_id: post.id,
          media_id: m.media_id,
          usage_type: m.usage_type,
          sort_order: m.sort_order,
        })),
      );
    }

    await trx('post_revisions').where({ id: revision.id }).update({
      status: 'applied',
      review_feedback: null,
      reviewed_by: user.id,
      reviewed_at: now,
      updated_at: now,
    });

    postId = post.id;
  });

  return getManagedPostById(user, postId);
}

module.exports = {
  toPublicPost,
  toManagedPost,
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
  submitPostForReview,
  approvePost,
  requestPostChanges,
  getReviewQueue,
  createRevision,
  listRevisions,
  getRevisionById,
  updateRevision,
  submitRevisionForReview,
  requestRevisionChanges,
  approveRevision,
  VALID_STATUSES,
  VALID_REVISION_STATUSES,
  REVIEW_FEEDBACK_MAX,
};
