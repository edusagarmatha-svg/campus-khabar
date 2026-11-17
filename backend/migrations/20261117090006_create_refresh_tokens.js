exports.up = async function up(knex) {
  // Recorded when a session is created; useful for staff-account auditing.
  await knex.schema.alterTable('users', (table) => {
    table
      .datetime('last_login_at', { precision: 3 })
      .nullable()
      .after('is_active');
  });

  // One row per issued refresh token. Only the SHA-256 hash is stored; the
  // token itself exists only in the client's HttpOnly cookie. Tokens in the
  // same login are tied together by session_id so reuse detection can revoke
  // just that session instead of every device the user owns.
  await knex.schema.createTable('refresh_tokens', (table) => {
    table.bigIncrements('id');

    table.bigInteger('user_id').unsigned().notNullable();
    table.string('session_id', 36).notNullable();
    table.string('token_hash', 64).notNullable().unique();

    table.datetime('expires_at', { precision: 3 }).notNullable();
    table.datetime('revoked_at', { precision: 3 }).nullable();

    // Rotation link: the token that superseded this one in the same session.
    table.bigInteger('replaced_by_id').unsigned().nullable();

    table
      .datetime('created_at', { precision: 3 })
      .notNullable()
      .defaultTo(knex.raw('CURRENT_TIMESTAMP(3)'));

    table.index(['session_id'], 'idx_refresh_tokens_session');
    table.index(['user_id', 'expires_at'], 'idx_refresh_tokens_user_expires');
    table.index(['expires_at'], 'idx_refresh_tokens_expires');

    table.foreign('user_id').references('users.id').onDelete('CASCADE');
    table
      .foreign('replaced_by_id')
      .references('refresh_tokens.id')
      .onDelete('SET NULL');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTable('refresh_tokens');

  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('last_login_at');
  });
};
