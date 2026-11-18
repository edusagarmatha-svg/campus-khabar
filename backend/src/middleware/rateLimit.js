const rateLimit = require('express-rate-limit');
const env = require('../config/env');

// Applied to all /api/auth routes. Generous in test mode so the suite does
// not trip the limiter.
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.isTest ? 100000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' },
  },
});

module.exports = { authRateLimiter };
