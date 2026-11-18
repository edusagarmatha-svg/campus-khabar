const express = require('express');
const { z } = require('zod');

const { validateBody, validateQuery } = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/authenticate');
const postController = require('../controllers/postController');

const router = express.Router();

const postTypeSchema = z.enum(['news', 'article', 'notice', 'announcement']);
const statusSchema = z.enum(['draft', 'published', 'unpublished']);
const usageTypeSchema = z.enum(['gallery', 'inline', 'attachment']);

const mediaLinkSchema = z.object({
  media_id: z.coerce.number().int().positive(),
  usage_type: usageTypeSchema.optional(),
  sort_order: z.coerce.number().int().optional(),
});

const postCreateSchema = z.object({
  title: z.string().trim().min(1).max(255),
  slug: z.string().trim().min(1).max(255).optional(),
  summary: z.string().trim().max(500).nullable().optional(),
  content: z.any(),
  post_type: postTypeSchema,
  category_id: z.coerce.number().int().positive(),
  cover_media_id: z.union([z.null(), z.coerce.number().int().positive()]).optional(),
  status: statusSchema.optional(),
  is_featured: z.boolean().optional(),
  published_at: z.union([z.null(), z.string().datetime()]).optional(),
  expires_at: z.union([z.null(), z.string().datetime()]).optional(),
  media: z.array(mediaLinkSchema).optional(),
});

const postUpdateSchema = postCreateSchema.partial().omit({ content: true }).extend({
  content: z.any().optional(),
});

const publicQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
  post_type: postTypeSchema.optional(),
  category: z.union([z.string(), z.number()]).optional(),
  featured: z.enum(['true', 'false']).optional(),
  q: z.string().trim().max(200).optional(),
  sort: z.enum(['latest', 'featured']).optional(),
});

const managedQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  status: statusSchema.optional(),
  post_type: postTypeSchema.optional(),
  category: z.coerce.number().int().positive().optional(),
  author: z.coerce.number().int().positive().optional(),
  include_deleted: z.enum(['true', 'false']).optional(),
});

router.get('/', validateQuery(publicQuerySchema), postController.listPublic);
router.get('/:slug', postController.getBySlug);

// Staff routes
router.get('/manage/list', authenticate, authorize('admin', 'editor'), validateQuery(managedQuerySchema), postController.listManaged);
router.get('/manage/:id', authenticate, authorize('admin', 'editor'), postController.getById);
router.post('/', authenticate, authorize('admin', 'editor'), validateBody(postCreateSchema), postController.create);
router.patch('/:id', authenticate, authorize('admin', 'editor'), validateBody(postUpdateSchema), postController.update);
router.delete('/:id', authenticate, authorize('admin', 'editor'), postController.remove);

module.exports = router;
