exports.up = async function up(knex) {
  await knex.schema.createTable('categories', (table) => {
    table.bigIncrements('id');
    table.string('name', 120).notNullable().unique();
    table.string('slug', 160).notNullable().unique();
    table.string('description', 500).nullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.integer('sort_order').notNullable().defaultTo(0);
    table
      .datetime('created_at', { precision: 3 })
      .notNullable()
      .defaultTo(knex.raw('CURRENT_TIMESTAMP(3)'));
    table
      .datetime('updated_at', { precision: 3 })
      .notNullable()
      .defaultTo(knex.raw('CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)'));

    table.index(['is_active', 'sort_order'], 'idx_categories_active_order');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTable('categories');
};
