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

module.exports = {
  listPublic,
  getBySlug,
  listManaged,
  getById,
  create,
  update,
  remove,
};
