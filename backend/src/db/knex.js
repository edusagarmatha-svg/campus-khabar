const knex = require('knex');

const config = require('../../knexfile');

const environment = process.env.NODE_ENV || 'development';

if (!config[environment]) {
  throw new Error(`Unknown NODE_ENV "${environment}" in knexfile.js`);
}

/**
 * Single shared Knex instance. Import this instead of creating new pools so
 * the whole process uses one mysql2 connection pool.
 */
module.exports = knex(config[environment]);
