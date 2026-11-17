exports.up = async function up(knex) {
  await knex.schema.createTable('posts', (table) => {
    table.bigIncrements('id');
    table.string('title', 255).notNullable();
    table.string('slug', 255).notNullable().unique();
    table.string('summary', 500).nullable();
    table.json('content').notNullable();
    table.string('post_type', 16).notNullable();
    table
      .bigInteger('category_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('categories')
      .onDelete('RESTRICT');
    table
      .bigInteger('author_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('RESTRICT');
    table
      .bigInteger('cover_media_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('media')
      .onDelete('SET NULL');
    table.string('status', 16).notNullable().defaultTo('draft');
    table.boolean('is_featured').notNullable().defaultTo(false);
    table.datetime('published_at', { precision: 3 }).nullable();
    table.datetime('expires_at', { precision: 3 }).nullable();
    table
      .datetime('created_at', { precision: 3 })
      .notNullable()
      .defaultTo(knex.raw('CURRENT_TIMESTAMP(3)'));
    table
      .datetime('updated_at', { precision: 3 })
      .notNullable()
      .defaultTo(knex.raw('CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)'));
    table.datetime('deleted_at', { precision: 3 }).nullable();

    table.index(
      ['status', 'deleted_at', 'published_at', 'id'],
      'idx_posts_public_feed',
    );
    table.index(
      ['post_type', 'status', 'deleted_at', 'published_at'],
      'idx_posts_type_feed',
    );
    table.index(
      ['category_id', 'status', 'deleted_at', 'published_at'],
      'idx_posts_category_feed',
    );
    table.index(
      ['is_featured', 'status', 'deleted_at', 'published_at'],
      'idx_posts_featured_feed',
    );
    table.index(['author_id', 'created_at'], 'idx_posts_author_created');
    table.index(['status', 'expires_at'], 'idx_posts_status_expires');
  });

  await knex.raw(
    "ALTER TABLE `posts` ADD CONSTRAINT `chk_posts_post_type` " +
      "CHECK (`post_type` IN ('news', 'article', 'notice', 'announcement'))",
  );
  await knex.raw(
    "ALTER TABLE `posts` ADD CONSTRAINT `chk_posts_status` " +
      "CHECK (`status` IN ('draft', 'published', 'unpublished'))",
  );
  await knex.raw(
    "ALTER TABLE `posts` ADD CONSTRAINT `chk_posts_published_at` " +
      "CHECK (`status` <> 'published' OR `published_at` IS NOT NULL)",
  );
  await knex.raw(
    "ALTER TABLE `posts` ADD CONSTRAINT `chk_posts_expiry_after_publication` " +
      "CHECK (`expires_at` IS NULL OR `published_at` IS NULL " +
      "OR `expires_at` > `published_at`)",
  );
};

exports.down = async function down(knex) {
  await knex.schema.dropTable('posts');
};
