exports.up = async function up(knex) {
  await knex.schema.createTable('media', (table) => {
    table.bigIncrements('id');
    table.string('media_type', 16).notNullable();
    table.string('source_type', 16).notNullable();
    table.string('storage_provider', 32).notNullable();
    table.string('storage_key', 512).notNullable();
    table.string('file_url', 1024).notNullable();
    table.string('file_name', 255).nullable();
    table.string('mime_type', 127).notNullable();
    table.bigInteger('file_size').unsigned().nullable();
    table.string('alt_text', 255).nullable();
    table.integer('width').unsigned().nullable();
    table.integer('height').unsigned().nullable();
    table.decimal('duration_seconds', 10, 3).nullable();
    table
      .bigInteger('uploaded_by')
      .unsigned()
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table
      .datetime('created_at', { precision: 3 })
      .notNullable()
      .defaultTo(knex.raw('CURRENT_TIMESTAMP(3)'));

    table.unique(['storage_provider', 'storage_key'], {
      indexName: 'uq_media_storage_object',
    });
    table.index(['media_type', 'created_at'], 'idx_media_type_created');
  });

  await knex.raw(
    "ALTER TABLE `media` ADD CONSTRAINT `chk_media_type` " +
      "CHECK (`media_type` IN ('image', 'video', 'document'))",
  );
  await knex.raw(
    "ALTER TABLE `media` ADD CONSTRAINT `chk_media_source_type` " +
      "CHECK (`source_type` IN ('upload', 'external'))",
  );
  await knex.raw(
    "ALTER TABLE `media` ADD CONSTRAINT `chk_media_file_size` CHECK " +
      "(`source_type` = 'external' OR (`file_size` IS NOT NULL AND `file_size` > 0))",
  );
};

exports.down = async function down(knex) {
  await knex.schema.dropTable('media');
};
