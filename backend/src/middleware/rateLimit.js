const rateLimit = require('express-rate-limit');
const env = require('../config/env');

const windowMs = env.rateLimit.windowMs;

const rateLimitedMessage = {
  error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' },
};

// Pass-through used only when rate limiting is explicitly disabled (dev/test).
function passThrough(req, res, next) {
  return next();
}

function makeLimiter(max, options = {}) {
  if (env.rateLimit.disabled) {
    return passThrough;
  }
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimitedMessage,
    ...options,
  });
}

// Applied only to POST /api/auth/login. Counts failed attempts only
// (successful logins do not consume the budget).
const loginRateLimiter = makeLimiter(env.rateLimit.loginMax, {
  skipSuccessfulRequests: true,
});

// Applied to the remaining auth endpoints (/refresh, /logout, /me) so normal
// SPA usage (which polls /me and refreshes tokens) is not blocked by the
// stricter login budget.
const authRateLimiter = makeLimiter(env.rateLimit.authMax);

module.exports = { loginRateLimiter, authRateLimiter };