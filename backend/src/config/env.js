const path = require('node:path');

// Load backend/.env regardless of the process working directory, so `node
// src/server.js` behaves the same whether it is started from backend/ or the
// repository root. Real process env vars always win over .env values.
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const VALID_ENVIRONMENTS = ['development', 'test', 'production'];

const errors = [];

function readPort(name, fallback) {
  const raw = process.env[name];

  if (raw === undefined || raw === '') {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    errors.push(`${name} must be an integer between 1 and 65535; got "${raw}"`);
    return fallback;
  }

  return value;
}

const nodeEnv = process.env.NODE_ENV || 'development';

if (!VALID_ENVIRONMENTS.includes(nodeEnv)) {
  errors.push(
    `NODE_ENV must be one of ${VALID_ENVIRONMENTS.join(', ')}; got "${nodeEnv}"`,
  );
}

const isProduction = nodeEnv === 'production';

const port = readPort('PORT', 4000);
const dbPort = readPort('DB_PORT', 3306);

const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (corsOrigins.length === 0) {
  errors.push('CORS_ORIGIN must contain at least one origin');
}

const db = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: dbPort,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'campus_kabar',
};

// Local development may rely on defaults; a deployed process must be explicit
// so it can never silently connect to a default database with a blank password.
if (isProduction) {
  for (const name of ['DB_USER', 'DB_PASSWORD', 'DB_NAME']) {
    if (!process.env[name]) {
      errors.push(`${name} is required when NODE_ENV=production`);
    }
  }

  if (!process.env.CORS_ORIGIN) {
    errors.push('CORS_ORIGIN is required when NODE_ENV=production');
  }
}

if (errors.length > 0) {
  throw new Error(
    `Invalid environment configuration:\n  - ${errors.join('\n  - ')}`,
  );
}

/**
 * Single source of truth for environment settings. Secrets stay in memory and
 * are never logged or returned by an endpoint.
 */
module.exports = Object.freeze({
  nodeEnv,
  isProduction,
  port,
  corsOrigins: Object.freeze(corsOrigins),
  db: Object.freeze(db),
});
