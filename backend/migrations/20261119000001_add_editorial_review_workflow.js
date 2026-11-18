exports.up = async function up(knex) {
  // 1. Widen status column so new values fit.
  await knex.raw('ALTER TABLE `posts` MODIFY COLUMN `status` VARCHAR(24) NOT NULL DEFAULT \'draft\'');

  // 2. Replace status CHECK constraint.
  await knex.raw('ALTER TABLE `posts` DROP CHECK `chk_posts_status`');
  await knex.raw(
    "ALTER TABLE `posts` ADD CONSTRAINT `chk_posts_status` " +
      "CHECK (`status` IN ('draft', 'pending_review', 'changes_requested', 'published', 'unpublished'))",
  );

  // 3. Review metadata on posts.
  await knex.schema.alterTable('posts', (table) => {
    table.datetime('submitted_at', { precision: 3 }).nullable().after('status');
    table.text('review_feedback').nullable().after('submitted_at');
    table.bigInteger('reviewed_by').unsigned().nullable().after('review_feedback');
    table.datetime('reviewed_at', { precision: 3 }).nullable().after('reviewed_by');

    table.foreign('reviewed_by').references('users.id').onDelete('SET NULL');
    table.index(['status', 'submitted_at'], 'idx_posts_status_submitted');
  });

  // 4. Revisions for edits to published posts.
  await knex.schema.createTable('post_revisions', (table) => {
    table.bigIncrements('id');

    table.bigInteger('post_id').unsigned().notNullable();
    table.bigInteger('author_id').unsigned().notNullable();

    table.string('title', 255).notNullable();
    table.string('slug', 255).nullable();
    table.string('summary', 500).nullable();
    table.json('content').notNullable();
    table.string('post_type', 16).notNullable();
    table.bigInteger('category_id').unsigned().notNullable();
    table.bigInteger('cover_media_id').unsigned().nullable();

    table.string('status', 24).notNullable().defaultTo('pending_review');

    table.text('review_feedback').nullable();
    table.datetime('submitted_at', { precision: 3 }).nullable();
    table.bigInteger('reviewed_by').unsigned().nullable();
    table.datetime('reviewed_at', { precision: 3 }).nullable();

    table
      .datetime('created_at', { precision: 3 })
      .notNullable()
      .defaultTo(knex.raw('CURRENT_TIMESTAMP(3)'));
    table
      .datetime('updated_at', { precision: 3 })
      .notNullable()
      .defaultTo(knex.raw('CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)'));

    table.foreign('post_id').references('posts.id').onDelete('CASCADE');
    table.foreign('author_id').references('users.id').onDelete('RESTRICT');
    table.foreign('category_id').references('categories.id').onDelete('RESTRICT');
    table.foreign('cover_media_id').references('media.id').onDelete('SET NULL');
    table.foreign('reviewed_by').references('users.id').onDelete('SET NULL');

    table.index(['post_id', 'status'], 'idx_post_revisions_post_status');
    table.index(['author_id', 'status'], 'idx_post_revisions_author_status');
    table.index(['status', 'submitted_at'], 'idx_post_revisions_status_submitted');
  });

  await knex.raw(
    "ALTER TABLE `post_revisions` ADD CONSTRAINT `chk_post_revisions_post_type` " +
      "CHECK (`post_type` IN ('news', 'article', 'notice', 'announcement'))",
  );
  await knex.raw(
    "ALTER TABLE `post_revisions` ADD CONSTRAINT `chk_post_revisions_status` " +
      "CHECK (`status` IN ('pending_review', 'changes_requested', 'applied', 'discarded'))",
  );

  // 5. Revision media junction mirroring post_media.
  await knex.schema.createTable('post_revision_media', (table) => {
    table.bigInteger('revision_id').unsigned().notNullable();
    table.bigInteger('media_id').unsigned().notNullable();
    table.string('usage_type', 16).notNullable();
    table.integer('sort_order').notNullable().defaultTo(0);

    table.primary(['revision_id', 'media_id', 'usage_type']);
    table
      .foreign('revision_id')
      .references('id')
      .inTable('post_revisions')
      .onDelete('CASCADE');
    table
      .foreign('media_id')
      .references('id')
      .inTable('media')
      .onDelete('RESTRICT');
    table.index(['media_id', 'usage_type'], 'idx_post_revision_media_media_usage');
  });

  await knex.raw(
    "ALTER TABLE `post_revision_media` ADD CONSTRAINT `chk_post_revision_media_usage_type` " +
      "CHECK (`usage_type` IN ('gallery', 'inline', 'attachment'))",
  );
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('post_revision_media');
  await knex.schema.dropTableIfExists('post_revisions');

  // Remove review metadata columns.
  await knex.schema.alterTable('posts', (table) => {
    table.dropForeign('reviewed_by');
    table.dropIndex(['status', 'submitted_at'], 'idx_posts_status_submitted');
    table.dropColumn('reviewed_at');
    table.dropColumn('reviewed_by');
    table.dropColumn('review_feedback');
    table.dropColumn('submitted_at');
  });

  // Restore status CHECK (best effort; new statuses must be cleaned first in prod).
  await knex.raw('ALTER TABLE `posts` DROP CHECK `chk_posts_status`');
  await knex.raw(
    "ALTER TABLE `posts` ADD CONSTRAINT `chk_posts_status` " +
      "CHECK (`status` IN ('draft', 'published', 'unpublished'))",
  );
  await knex.raw('ALTER TABLE `posts` MODIFY COLUMN `status` VARCHAR(16) NOT NULL DEFAULT \'draft\'');
};