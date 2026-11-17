exports.up = async function up(knex) {
  await knex.schema.createTable('users', (table) => {
    table.bigIncrements('id');
    table.string('name', 120).notNullable();
    table.string('email', 255).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.string('role', 16).notNullable().defaultTo('editor');
    table.boolean('is_active').notNullable().defaultTo(true);
    table
      .datetime('created_at', { precision: 3 })
      .notNullable()
      .defaultTo(knex.raw('CURRENT_TIMESTAMP(3)'));
    table
      .datetime('updated_at', { precision: 3 })
      .notNullable()
      .defaultTo(knex.raw('CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)'));

    table.index(['role', 'is_active'], 'idx_users_role_active');
  });

  await knex.raw(
    "ALTER TABLE `users` ADD CONSTRAINT `chk_users_role` " +
      "CHECK (`role` IN ('admin', 'editor', 'reader'))",
  );
};

exports.down = async function down(knex) {
  await knex.schema.dropTable('users');
};
