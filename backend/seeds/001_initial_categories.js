exports.seed = async function seed(knex) {
  const categories = [
    {
      name: 'News',
      slug: 'news',
      description: 'Campus news and updates.',
      sort_order: 10,
    },
    {
      name: 'Articles',
      slug: 'articles',
      description: 'In-depth stories and opinion.',
      sort_order: 20,
    },
    {
      name: 'Notices',
      slug: 'notices',
      description: 'Official notices for students and staff.',
      sort_order: 30,
    },
    {
      name: 'Announcements',
      slug: 'announcements',
      description: 'Time-sensitive campus announcements.',
      sort_order: 40,
    },
  ];

  await knex('categories').insert(categories).onConflict('slug').ignore();
};
