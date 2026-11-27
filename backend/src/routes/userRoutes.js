const express = require('express');
const { z } = require('zod');

const { validateBody, validateQuery } = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/authenticate');
const userController = require('../controllers/userController');

const router = express.Router();

const roleSchema = z.enum(['admin', 'editor']);

const createUserSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255),
  password: z.string().min(12),
  role: roleSchema.optional(),
  is_active: z.boolean().optional(),
});

const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().max(255).optional(),
  password: z.string().min(12).optional(),
  role: roleSchema.optional(),
  is_active: z.boolean().optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  role: roleSchema.optional(),
  is_active: z.coerce.boolean().optional(),
  q: z.string().trim().max(200).optional(),
});

router.use(authenticate, authorize('admin'));

router.get('/', validateQuery(listQuerySchema), userController.list);
router.get('/:id', userController.getById);
router.post('/', validateBody(createUserSchema), userController.create);
router.patch('/:id', validateBody(updateUserSchema), userController.update);

module.exports = router;
