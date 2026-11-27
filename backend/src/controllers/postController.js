const postService = require('../services/postService');

function parsePagination(req) {
  return {
    page: req.query.page,
    limit: req.query.limit,
  };
}

function parseFilters(req) {
  const filters = {};
  if (req.query.post_type) filters.post_type = req.query.post_type;
  if (req.query.category) filters.category = req.query.category;
  if (req.query.featured !== undefined) {
    filters.featured = req.query.featured === 'true';
  }
  if (req.query.q) filters.q = req.query.q;
  if (req.query.sort) filters.sort = req.query.sort;
  if (req.query.status) filters.status = req.query.status;
  if (req.query.author) filters.author = req.query.author;
  if (req.query.include_deleted !== undefined) {
    filters.include_deleted = req.query.include_deleted;
  }
  return filters;
}

async function listPublic(req, res) {
  const result = await postService.listPublicPosts(parseFilters(req), parsePagination(req));
  res.status(200).json(result);
}

async function getBySlug(req, res) {
  const post = await postService.getPublicPostBySlug(req.params.slug);
  res.status(200).json({ data: post });
}

async function listManaged(req, res) {
  const result = await postService.listManagedPosts(req.user, parseFilters(req), parsePagination(req));
  res.status(200).json(result);
}

async function getById(req, res) {
  const post = await postService.getManagedPostById(req.user, req.params.id);
  res.status(200).json({ data: post });
}

async function create(req, res) {
  const post = await postService.createPost(req.user, req.body);
  res.status(201).json({ data: post });
}

async function update(req, res) {
  const post = await postService.updatePost(req.user, req.params.id, req.body);
  res.status(200).json({ data: post });
}

async function remove(req, res) {
  const post = await postService.softDeletePost(req.user, req.params.id);
  res.status(200).json({ data: post });
}

async function submitReview(req, res) {
  const post = await postService.submitPostForReview(req.user, req.params.id);
  res.status(200).json({ data: post });
}

async function approve(req, res) {
  const post = await postService.approvePost(req.user, req.params.id);
  res.status(200).json({ data: post });
}

async function requestChanges(req, res) {
  const post = await postService.requestPostChanges(req.user, req.params.id, req.body.feedback);
  res.status(200).json({ data: post });
}

async function reviewQueue(req, res) {
  const result = await postService.getReviewQueue(req.user, parsePagination(req));
  res.status(200).json(result);
}

async function createRevision(req, res) {
  const revision = await postService.createRevision(req.user, req.params.id, req.body);
  res.status(201).json({ data: revision });
}

async function listRevisions(req, res) {
  const result = await postService.listRevisions(req.user, req.params.id);
  res.status(200).json(result);
}

async function getRevision(req, res) {
  const revision = await postService.getRevisionById(req.user, req.params.id);
  res.status(200).json({ data: revision });
}

async function updateRevision(req, res) {
  const revision = await postService.updateRevision(req.user, req.params.id, req.body);
  res.status(200).json({ data: revision });
}

async function submitRevision(req, res) {
  const revision = await postService.submitRevisionForReview(req.user, req.params.id);
  res.status(200).json({ data: revision });
}

async function approveRevision(req, res) {
  const post = await postService.approveRevision(req.user, req.params.id);
  res.status(200).json({ data: post });
}

async function requestRevisionChanges(req, res) {
  const revision = await postService.requestRevisionChanges(
    req.user,
    req.params.id,
    req.body.feedback,
  );
  res.status(200).json({ data: revision });
}

module.exports = {
  listPublic,
  getBySlug,
  listManaged,
  getById,
  create,
  update,
  remove,
  submitReview,
  approve,
  requestChanges,
  reviewQueue,
  createRevision,
  listRevisions,
  getRevision,
  updateRevision,
  submitRevision,
  approveRevision,
  requestRevisionChanges,
};
