const db = require('../db/knex');
const env = require('../config/env');

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function absoluteUrl(path) {
  return `${env.publicSiteUrl}${path}`;
}

function isoDate(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function getPublicSitemapEntries() {
  const now = new Date();

  const [posts, categories] = await Promise.all([
    db('posts')
      .select('slug', 'updated_at', 'published_at')
      .where({ status: 'published' })
      .whereNull('deleted_at')
      .where('published_at', '<=', now)
      .where((query) => {
        query.whereNull('expires_at').orWhere('expires_at', '>', now);
      })
      .orderBy('published_at', 'desc'),
    db('categories')
      .select('slug', 'updated_at')
      .where({ is_active: true })
      .orderBy('sort_order', 'asc')
      .orderBy('name', 'asc'),
  ]);

  const entries = [
    {
      loc: absoluteUrl('/'),
      lastmod: isoDate(posts[0]?.updated_at),
      changefreq: 'daily',
      priority: '1.0',
    },
    ...categories.map((category) => ({
      loc: absoluteUrl(`/category/${encodeURIComponent(category.slug)}`),
      lastmod: isoDate(category.updated_at),
      changefreq: 'weekly',
      priority: '0.7',
    })),
    ...posts.map((post) => ({
      loc: absoluteUrl(`/posts/${encodeURIComponent(post.slug)}`),
      lastmod: isoDate(post.updated_at || post.published_at),
      changefreq: 'monthly',
      priority: '0.8',
    })),
  ];

  return entries;
}

async function buildSitemap() {
  const entries = await getPublicSitemapEntries();

  const urls = entries
    .map(
      (entry) =>
        `  <url>\n` +
        `    <loc>${escapeXml(entry.loc)}</loc>\n` +
        (entry.lastmod ? `    <lastmod>${escapeXml(entry.lastmod)}</lastmod>\n` : '') +
        (entry.changefreq
          ? `    <changefreq>${escapeXml(entry.changefreq)}</changefreq>\n`
          : '') +
        (entry.priority
          ? `    <priority>${escapeXml(entry.priority)}</priority>\n`
          : '') +
        `  </url>`,
    )
    .join('\n');

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    `${urls}\n` +
    '</urlset>\n'
  );
}

function buildRobots() {
  return (
    'User-agent: *\n' +
    'Allow: /\n' +
    'Disallow: /admin\n' +
    'Disallow: /api\n' +
    'Disallow: /search\n' +
    '\n' +
    `Sitemap: ${env.publicSiteUrl}/sitemap.xml\n`
  );
}

module.exports = {
  buildSitemap,
  buildRobots,
  getPublicSitemapEntries,
  escapeXml,
};
