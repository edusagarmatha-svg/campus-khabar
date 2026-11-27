const express = require('express');
const multer = require('multer');
const { z } = require('zod');

const { validateQuery } = require('../middleware/validate');
const { authenticate, authorize } = require('../middleware/authenticate');
const mediaController = require('../controllers/mediaController');
const storageService = require('../services/storageService');
const { httpError } = require('../utils/errors');

const router = express.Router();

const mediaTypeSchema = z.enum(['image', 'video', 'document']);

const uploadSchema = z.object({
  media_type: mediaTypeSchema,
  file_name: z.string().trim().max(255).optional(),
  alt_text: z.string().trim().max(255).optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  media_type: mediaTypeSchema.optional(),
  uploaded_by: z.coerce.number().int().positive().optional(),
});

// The outer cap is the largest per-type limit; the storage layer then enforces
// the exact limit for the declared media type once the real size is known.
// Streaming to the volume's tmp directory keeps a 100 MB video out of memory.
const MAX_UPLOAD_BYTES = Math.max(...Object.values(storageService.MEDIA_LIMITS));

const multerUpload = multer({
  storage: multer.diskStorage({
    destination(req, file, done) {
      done(null, storageService.tmpRoot());
    },
    filename(req, file, done) {
      done(null, `${require('node:crypto').randomUUID()}.part`);
    },
  }),
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
    files: 1,
    fields: 8,
    parts: 10,
  },
}).single('file');

/**
 * Runs multer and translates its errors into the API's error shape. Without
 * this, an oversized upload surfaces as an unhandled 500 instead of a 413.
 */
function receiveUpload(req, res, next) {
  multerUpload(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return next(
          httpError(413, 'ASSET_TOO_LARGE', 'File exceeds maximum allowed size'),
        );
      }

      if (error.code === 'LIMIT_UNEXPECTED_FILE' || error.code === 'LIMIT_FILE_COUNT') {
        return next(
          httpError(400, 'INVALID_UPLOAD', 'Send exactly one file in a field named "file"'),
        );
      }

      return next(httpError(400, 'INVALID_UPLOAD', 'Upload rejected'));
    }

    return next(error);
  });
}

/**
 * Validates the multipart text fields, which are only populated once multer
 * has parsed the request. A rejected field set must not leave the temporary
 * file behind.
 */
async function validateUploadFields(req, res, next) {
  try {
    req.body = uploadSchema.parse(req.body || {});
    next();
  } catch (error) {
    if (req.file) {
      await storageService.removeQuietly(req.file.path);
    }

    const issue = (error.issues && error.issues[0]) || {};
    next(httpError(400, 'VALIDATION_ERROR', issue.message || 'Invalid request body'));
  }
}

router.use(authenticate, authorize('admin', 'editor'));

router.get('/', validateQuery(listQuerySchema), mediaController.list);
router.get('/:id', mediaController.getById);
router.post('/', receiveUpload, validateUploadFields, mediaController.upload);
router.delete('/:id', mediaController.remove);

module.exports = router;
