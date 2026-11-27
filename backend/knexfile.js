const path = require('node:path');

const env = require('./src/config/env');

/**
 * Shared Knex configuration for the CLI (migrations, seeds) and the
 * application pool.
 *
 * Connection settings come from `src/config/env.js`, the single place that
 * loads `.env` and validates configuration, so the API and the Knex CLI can
 * never drift apart.
 *
 * All timestamps are stored in UTC. The connection is pinned to +00:00 and
 * `timezone: 'Z'` tells mysql2 to read DATETIME values back as UTC, so the
 * application never has to reason about the server's local timezone.
 *
 * `env.db.ssl` is passed through to mysql2. It is `false` for local
 * development and an SSL options object for configured remote/managed DBs.
 */
function connection() {
  return {
    ...env.db,
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
