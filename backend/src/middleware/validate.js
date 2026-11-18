const { z } = require('zod');
const { httpError } = require('../utils/errors');

function validateBody(schema) {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body || {});
      next();
    } catch (error) {
      const issue = (error.issues && error.issues[0]) || {};
      const message = issue.message || 'Invalid request body';
      next(httpError(400, 'VALIDATION_ERROR', message));
    }
  };
}

module.exports = { validateBody };
