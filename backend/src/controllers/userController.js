const userService = require('../services/userService');

async function list(req, res) {
  const result = await userService.listUsers(req.query, {
    page: req.query.page,
    limit: req.query.limit,
  });
  res.status(200).json(result);
}

async function getById(req, res) {
  const user = await userService.getUser(req.params.id);
  res.status(200).json({ data: user });
}

async function create(req, res) {
  const user = await userService.createUser(req.body);
  res.status(201).json({ data: user });
}

async function update(req, res) {
  const user = await userService.updateUser(req.params.id, req.user, req.body);
  res.status(200).json({ data: user });
}

module.exports = { list, getById, create, update };
