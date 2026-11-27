const express = require('express');

const seoController = require('../controllers/seoController');

const router = express.Router();

router.get('/robots.txt', seoController.robots);
router.get('/sitemap.xml', seoController.sitemap);

module.exports = router;
