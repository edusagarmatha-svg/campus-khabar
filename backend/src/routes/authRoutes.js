const express = require('express');
const { z } = require('zod');

const { validateBody } = require('../middleware/validate');
const { loginRateLimiter, authRateLimiter } = require('../middleware/rateLimit');
const { validateOrigin } = require('../middleware/origin');
const { authenticate } = require('../middleware/authenticate');
const authController = require('../controllers/authController');

const router = express.Router();

// Auth responses can contain access tokens or user profile data. Never allow a
// browser, proxy or shared cache to retain them.
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  next();
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

router.post('/login', loginRateLimiter, validateBody(loginSchema), authController.login);
router.post('/refresh', authRateLimiter, validateOrigin, authController.refresh);
router.post('/logout', authRateLimiter, validateOrigin, authController.logout);
router.get('/me', authRateLimiter, authenticate, authController.me);

module.exports = router;