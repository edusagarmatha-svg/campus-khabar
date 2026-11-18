const express = require('express');
const { z } = require('zod');

const { validateBody, validateQuery } = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/authenticate');
const mediaController = require('../controllers/mediaController');

const router = express.Router();

const mediaTypeSchema = z.enum(['image', 'video', 'document']);

const signatureSchema = z.object({
  media_type: mediaTypeSchema,
});

const registerSchema = z.object({
  media_type: mediaTypeSchema,
  public_id: z.string().trim().min(1).max(512),
  file_name: z.string().trim().max(255).optional(),
  alt_text: z.string().trim().max(255).optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  media_type: mediaTypeSchema.optional(),
  uploaded_by: z.coerce.number().int().positive().optional(),
});

router.use(authenticate, authorize('admin', 'editor'));

router.get('/', validateQuery(listQuerySchema), mediaController.list);
router.get('/:id', mediaController.getById);
router.post('/signature', validateBody(signatureSchema), mediaController.signature);
router.post('/', validateBody(registerSchema), mediaController.register);
router.delete('/:id', mediaController.remove);

module.exports = router;
