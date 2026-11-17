exports.up = async function up(knex) {
  await knex.schema.createTable('post_media', (table) => {
    table.bigInteger('post_id').unsigned().notNullable();
    table.bigInteger('media_id').unsigned().notNullable();
    table.string('usage_type', 16).notNullable();
    table.integer('sort_order').notNullable().defaultTo(0);

    table.primary(['post_id', 'media_id', 'usage_type']);
    table
      .foreign('post_id')
      .references('id')
      .inTable('posts')
      .onDelete('CASCADE');
    table
      .foreign('media_id')
      .references('id')
      .inTable('media')
      .onDelete('RESTRICT');
    table.index(['media_id', 'usage_type'], 'idx_post_media_media_usage');
  });

  await knex.raw(
    "ALTER TABLE `post_media` ADD CONSTRAINT `chk_post_media_usage_type` " +
      "CHECK (`usage_type` IN ('gallery', 'inline', 'attachment'))",
  );
};

exports.down = async function down(knex) {
  await knex.schema.dropTable('post_media');
};
