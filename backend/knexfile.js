require('dotenv').config();

const path = require('node:path');

/**
 * Shared Knex configuration for the CLI (migrations, seeds) and the
 * application pool.
 *
 * All timestamps are stored in UTC. The connection is pinned to +00:00 and
 * `timezone: 'Z'` tells mysql2 to read DATETIME values back as UTC, so the
 * application never has to reason about the server's local timezone.
 */
function connection() {
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'campus_kabar',
    charset: 'utf8mb4',
    timezone: 'Z',
    supportBigNumbers: true,
  };
}

const config = {
  client: 'mysql2',
  connection: connection(),
  pool: {
    min: 0,
    max: 10,
    afterCreate(conn, done) {
      conn.query("SET time_zone = '+00:00'", (error) =>
        done(error, conn),
      );
    },
  },
  migrations: {
    directory: path.join(__dirname, 'migrations'),
    tableName: 'knex_migrations',
  },
  seeds: {
    directory: path.join(__dirname, 'seeds'),
  },
};

module.exports = {
  development: config,
  test: config,
  production: config,
};
