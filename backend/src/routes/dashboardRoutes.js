const express = require('express');

const { authenticate, authorize } = require('../middleware/authenticate');
const dashboardService = require('../services/dashboardService');

const router = express.Router();

router.get(
  '/',
  authenticate,
  authorize('admin', 'editor'),
  async (req, res) => {
    const data = await dashboardService.getDashboard(req.user);
    res.status(200).json({ data });
  },
);

module.exports = router;
