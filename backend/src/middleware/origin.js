const env = require('../config/env');
const { httpError } = require('../utils/errors');

function validateOrigin(req, res, next) {
  const origin = req.get('origin');
  if (!origin) {
    // No Origin header (non-browser or same-origin client). Allow; stricter
    // deployments may require an Origin on cookie routes.
    return next();
  }
  if (!env.corsOrigins.includes(origin)) {
    return next(httpError(403, 'ORIGIN_NOT_ALLOWED', 'Origin not allowed'));
  }
  next();
}

module.exports = { validateOrigin };
