const express = require('express');
const { z } = require('zod');

const { validateBody } = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/authenticate');
const categoryController = require('../controllers/categoryController');

const router = express.Router();

const categorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

const categoryUpdateSchema = categorySchema.partial();

router.get('/', categoryController.list);
router.get('/:id', categoryController.getById);

router.post('/', authenticate, authorize('admin'), validateBody(categorySchema), categoryController.create);
router.patch('/:id', authenticate, authorize('admin'), validateBody(categoryUpdateSchema), categoryController.update);
router.delete('/:id', authenticate, authorize('admin'), categoryController.remove);

module.exports = router;
