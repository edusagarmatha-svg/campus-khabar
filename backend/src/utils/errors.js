/**
 * Small HTTP-error helper used by services so callers can distinguish status,
 * machine-readable code, and a safe user-facing message.
 *
 * The Express error handler in app.js already formats errors as
 * { "error": { "code", "message" } }; services throw HttpError instances and
 * the handler turns them into that shape without leaking internals.
 */
class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

function httpError(status, code, message) {
  return new HttpError(status, code, message);
}

function isHttpError(error) {
  return error instanceof HttpError;
}

module.exports = {
  HttpError,
  httpError,
  isHttpError,
};
