const express = require('express');
const { z } = require('zod');

const { validateBody } = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/authenticate');
const postController = require('../controllers/postController');

const router = express.Router();

const usageTypeSchema = z.enum(['gallery', 'inline', 'attachment']);

const mediaLinkSchema = z.object({
  media_id: z.coerce.number().int().positive(),
  usage_type: usageTypeSchema.optional(),
  sort_order: z.coerce.number().int().optional(),
});

const revisionUpdateSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  slug: z.string().trim().min(1).max(255).optional(),
  summary: z.string().trim().max(500).nullable().optional(),
  content: z.any().optional(),
  post_type: z.enum(['news', 'article', 'notice', 'announcement']).optional(),
  category_id: z.coerce.number().int().positive().optional(),
  cover_media_id: z.union([z.null(), z.coerce.number().int().positive()]).optional(),
  media: z.array(mediaLinkSchema).optional(),
});

const reviewFeedbackSchema = z.object({
  feedback: z.string().trim().min(1).max(4000),
});

router.get('/:id', authenticate, authorize('admin', 'editor'), postController.getRevision);
router.patch('/:id', authenticate, authorize('admin', 'editor'), validateBody(revisionUpdateSchema), postController.updateRevision);
router.post('/:id/submit-review', authenticate, authorize('admin', 'editor'), postController.submitRevision);
router.post('/:id/approve', authenticate, authorize('admin'), postController.approveRevision);
router.post('/:id/request-changes', authenticate, authorize('admin'), validateBody(reviewFeedbackSchema), postController.requestRevisionChanges);

module.exports = router;
