const mediaService = require('../services/mediaService');
const { httpError } = require('../utils/errors');

async function list(req, res) {
  const result = await mediaService.listMedia(req.user, req.query, {
    page: req.query.page,
    limit: req.query.limit,
  });
  res.status(200).json(result);
}

async function getById(req, res) {
  const media = await mediaService.getMediaById(req.params.id);
  res.status(200).json({ data: media });
}

/**
 * Receives a multipart upload. The upload middleware has already streamed the
 * bytes to a temporary file on the volume; the service validates the real file
 * contents, moves it into place and records the row.
 */
async function upload(req, res) {
  if (!req.file) {
    throw httpError(400, 'FILE_REQUIRED', 'A file field named "file" is required');
  }

  const media = await mediaService.storeUploadedMedia(req.user, {
    media_type: req.body.media_type,
    temp_path: req.file.path,
    file_name: req.body.file_name || req.file.originalname,
    alt_text: req.body.alt_text,
  });

  res.status(201).json({ data: media });
}

async function remove(req, res) {
  await mediaService.deleteMedia(req.user, req.params.id);
  res.status(204).send();
}

module.exports = { list, getById, upload, remove };
