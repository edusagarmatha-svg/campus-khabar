const express = require('express');
const { z } = require('zod');

const { validateBody, validateQuery } = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/authenticate');
const postController = require('../controllers/postController');

const router = express.Router();

const postTypeSchema = z.enum(['news', 'article', 'notice', 'announcement']);
const statusSchema = z.enum([
  'draft',
  'pending_review',
  'changes_requested',
  'published',
  'unpublished',
]);
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

// Proposed changes to an already-published post. Every field is optional
// because omitted fields inherit the post's current value.
const revisionSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  slug: z.string().trim().min(1).max(255).optional(),
  summary: z.string().trim().max(500).nullable().optional(),
  content: z.any().optional(),
  post_type: postTypeSchema.optional(),
  category_id: z.coerce.number().int().positive().optional(),
  cover_media_id: z.union([z.null(), z.coerce.number().int().positive()]).optional(),
  media: z.array(mediaLinkSchema).optional(),
});

const reviewFeedbackSchema = z.object({
  feedback: z.string().trim().min(1).max(4000),
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

const queueQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

// Public
router.get('/', validateQuery(publicQuerySchema), postController.listPublic);

// Staff — declared before the public "/:slug" route so that "review-queue"
// and "manage/..." are not swallowed by the slug matcher.
router.get(
  '/review-queue',
  authenticate,
  authorize('admin'),
  validateQuery(queueQuerySchema),
  postController.reviewQueue,
);
router.get('/manage/list', authenticate, authorize('admin', 'editor'), validateQuery(managedQuerySchema), postController.listManaged);
router.get('/manage/:id', authenticate, authorize('admin', 'editor'), postController.getById);
router.get('/:id/revisions', authenticate, authorize('admin', 'editor'), postController.listRevisions);
router.post('/:id/revisions', authenticate, authorize('admin', 'editor'), validateBody(revisionSchema), postController.createRevision);
router.post('/:id/submit-review', authenticate, authorize('admin', 'editor'), postController.submitReview);
router.post('/:id/approve', authenticate, authorize('admin'), postController.approve);
router.post('/:id/request-changes', authenticate, authorize('admin'), validateBody(reviewFeedbackSchema), postController.requestChanges);
router.post('/', authenticate, authorize('admin', 'editor'), validateBody(postCreateSchema), postController.create);
router.patch('/:id', authenticate, authorize('admin', 'editor'), validateBody(postUpdateSchema), postController.update);
router.delete('/:id', authenticate, authorize('admin', 'editor'), postController.remove);

// Public detail (after the staff routes above)
router.get('/:slug', postController.getBySlug);

module.exports = router;
