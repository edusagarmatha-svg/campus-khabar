const seoService = require('../services/seoService');

async function robots(req, res) {
  res
    .type('text/plain')
    .set('Cache-Control', 'public, max-age=3600')
    .send(seoService.buildRobots());
}

async function sitemap(req, res) {
  const xml = await seoService.buildSitemap();

  res
    .type('application/xml')
    .set('Cache-Control', 'public, max-age=300')
    .send(xml);
}

module.exports = { robots, sitemap };
