const db = require('../db/knex');

/**
 * Role-appropriate summary for the staff dashboard. Editors only see their own
 * content; admins see the whole editorial pipeline.
 */
async function getDashboard(user) {
  const isAdmin = user.role === 'admin';

  const postsQuery = () => {
    const query = db('posts').whereNull('deleted_at');
    if (!isAdmin) query.where({ author_id: user.id });
    return query;
  };

  const statusRows = await postsQuery()
    .select('status')
    .count({ total: '*' })
    .groupBy('status');

  const posts = {
    total: 0,
    draft: 0,
    pending_review: 0,
    changes_requested: 0,
    published: 0,
    unpublished: 0,
  };
  for (const row of statusRows) {
    const count = Number(row.total) || 0;
    posts.total += count;
    if (Object.prototype.hasOwnProperty.call(posts, row.status)) {
      posts[row.status] = count;
    }
  }

  const categoriesRow = await db('categories')
    .where({ is_active: true })
    .count({ total: '*' })
    .first();

  const mediaQuery = db('media');
  if (!isAdmin) mediaQuery.where({ uploaded_by: user.id });
  const mediaRow = await mediaQuery.count({ total: '*' }).first();

  const summary = {
    posts,
    categories: { active: Number(categoriesRow.total) || 0 },
    media: { total: Number(mediaRow.total) || 0 },
  };

  if (isAdmin) {
    const staffRow = await db('users').where({ is_active: true }).count({ total: '*' }).first();
    summary.staff = { active: Number(staffRow.total) || 0 };
  }

  const recentQuery = db('posts as p')
    .leftJoin('users as author', 'p.author_id', 'author.id')
    .select(
      'p.id',
      'p.title',
      'p.slug',
      'p.status',
      'p.updated_at',
      'p.submitted_at',
      'author.name as author_name',
    )
    .whereNull('p.deleted_at');

  if (!isAdmin) recentQuery.where('p.author_id', user.id);

  const recent = await recentQuery.orderBy('p.updated_at', 'desc').limit(5);
  summary.recent_posts = recent.map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    status: row.status,
    updated_at: row.updated_at,
    submitted_at: row.submitted_at,
    author_name: row.author_name,
  }));

  return summary;
}

module.exports = { getDashboard };
