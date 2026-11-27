exports.up = async function up(knex) {
  await knex.schema.createTable('system_locks', (table) => {
    table.string('name', 64).primary();
    table
      .datetime('created_at', { precision: 3 })
      .notNullable()
      .defaultTo(knex.raw('CURRENT_TIMESTAMP(3)'));
  });

  // A permanent row gives concurrent bootstrap transactions something real to
  // lock even when the users table contains no Admin yet.
  await knex('system_locks')
    .insert({ name: 'admin_bootstrap' })
    .onConflict('name')
    .ignore();
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('system_locks');
};
