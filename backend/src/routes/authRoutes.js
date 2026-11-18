const express = require('express');
const { z } = require('zod');

const { validateBody } = require('../middleware/validate');
const { authRateLimiter } = require('../middleware/rateLimit');
const { validateOrigin } = require('../middleware/origin');
const { authenticate } = require('../middleware/authenticate');
const authController = require('../controllers/authController');

const router = express.Router();

router.use(authRateLimiter);

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

router.post('/login', validateBody(loginSchema), authController.login);
router.post('/refresh', validateOrigin, authController.refresh);
router.post('/logout', validateOrigin, authController.logout);
router.get('/me', authenticate, authController.me);

module.exports = router;
