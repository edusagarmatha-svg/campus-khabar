const categoryService = require('../services/categoryService');

async function list(req, res) {
  const isAdmin = req.user && req.user.role === 'admin';
  const activeOnly = !(isAdmin && req.query.all === 'true');
  const categories = await categoryService.listCategories({ activeOnly });
  res.status(200).json({ data: categories });
}

async function getById(req, res) {
  const category = await categoryService.getCategoryById(req.params.id);
  res.status(200).json({ data: category });
}

async function create(req, res) {
  const category = await categoryService.createCategory(req.body);
  res.status(201).json({ data: category });
}

async function update(req, res) {
  const category = await categoryService.updateCategory(req.params.id, req.body);
  res.status(200).json({ data: category });
}

async function remove(req, res) {
  await categoryService.deleteCategory(req.params.id);
  res.status(204).send();
}

module.exports = { list, getById, create, update, remove };
