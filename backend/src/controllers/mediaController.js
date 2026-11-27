const mediaService = require('../services/mediaService');
const cloudinaryService = require('../services/cloudinaryService');

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

async function signature(req, res) {
  const result = cloudinaryService.generateUploadSignature(req.body.media_type);
  res.status(200).json({ data: result });
}

async function register(req, res) {
  const media = await mediaService.registerUploadedMedia(req.user, req.body);
  res.status(201).json({ data: media });
}

async function remove(req, res) {
  await mediaService.deleteMedia(req.user, req.params.id);
  res.status(204).send();
}

module.exports = { list, getById, signature, register, remove };
