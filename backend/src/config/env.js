const fs = require('node:fs');
const path = require('node:path');

const ENV_FILE = path.join(__dirname, '..', '..', '.env');

// Load backend/.env regardless of the process working directory, so `node
// src/server.js` behaves the same whether it is started from backend/ or the
// repository root. Real process env vars always win over .env values.
require('dotenv').config({ path: ENV_FILE });

const VALID_ENVIRONMENTS = ['development', 'test', 'production'];
const VALID_SAME_SITE = ['strict', 'lax', 'none'];

// Used only when a non-production process has no strong JWT secret configured,
// so the Knex CLI and local development work without a .env file. A production
// process refuses to start without a real secret.
const DEV_ACCESS_SECRET = 'insecure-development-access-secret-do-not-use-in-production';
const MIN_SECRET_LENGTH = 32;
const MIN_ACCESS_TOKEN_TTL_SECONDS = 60;
const MIN_REFRESH_TOKEN_TTL_SECONDS = 60;
const MAX_REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

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

function readBoolean(name, fallback) {
  const raw = process.env[name];

  if (raw === undefined || raw === '') {
    return fallback;
  }

  const normalized = raw.trim().toLowerCase();

  if (['true', '1', 'yes'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no'].includes(normalized)) {
    return false;
  }

  errors.push(`${name} must be true or false; got "${raw}"`);
  return fallback;
}

/**
 * Reads a duration such as "15m", "900s", "12h" or "7d" as a number of seconds.
 * A bare number is accepted as seconds.
 */
function readDuration(name, fallback, { min, max }) {
  const raw = process.env[name];

  if (raw === undefined || raw === '') {
    return fallback;
  }

  const match = /^(\d+)([smhd])?$/.exec(raw.trim());

  if (!match) {
    errors.push(
      `${name} must be a duration such as 900s, 15m, 12h or 7d; got "${raw}"`,
    );
    return fallback;
  }

  const units = { s: 1, m: 60, h: 3600, d: 86400 };
  const seconds = Number(match[1]) * units[match[2] || 's'];

  if (seconds < min || seconds > max) {
    errors.push(
      `${name} must be between ${min} and ${max} seconds; got "${raw}"`,
    );
    return fallback;
  }

  return seconds;
}

const nodeEnv = process.env.NODE_ENV || 'development';

if (!VALID_ENVIRONMENTS.includes(nodeEnv)) {
  errors.push(
    `NODE_ENV must be one of ${VALID_ENVIRONMENTS.join(', ')}; got "${nodeEnv}"`,
  );
}

const isProduction = nodeEnv === 'production';
const isTest = nodeEnv === 'test';

// A deployed .env must not be readable by other local users. Orchestrators that
// inject environment variables directly have no file to check.
if (isProduction && process.platform !== 'win32' && fs.existsSync(ENV_FILE)) {
  try {
    const mode = fs.statSync(ENV_FILE).mode & 0o777;
    if ((mode & 0o077) !== 0) {
      errors.push('backend/.env must not be accessible by group or others; use chmod 600');
    }
  } catch (error) {
    errors.push(`backend/.env permissions could not be checked (${error.code || 'file error'})`);
  }
}

const port = readPort('PORT', 4000);
const dbPort = readPort('DB_PORT', 3306);

const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (corsOrigins.length === 0) {
  errors.push('CORS_ORIGIN must contain at least one origin');
}

// Public site URL used for canonical links, robots.txt and the XML sitemap.
// Development may omit it; production must be explicit and HTTPS.
const publicSiteUrl = (
  process.env.PUBLIC_SITE_URL || (isProduction ? '' : 'http://localhost:5173')
).replace(/\/+$/, '');

if (!publicSiteUrl && isProduction) {
  errors.push('PUBLIC_SITE_URL is required when NODE_ENV=production');
} else if (publicSiteUrl) {
  try {
    const parsed = new URL(publicSiteUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      errors.push('PUBLIC_SITE_URL must use http or https');
    }
    if (isProduction && parsed.protocol !== 'https:') {
      errors.push('PUBLIC_SITE_URL must use https when NODE_ENV=production');
    }
  } catch {
    errors.push('PUBLIC_SITE_URL must be a valid absolute URL');
  }
}

// TLS is opt-in for local development. In production a non-local database
// host must use TLS so credentials and content are never sent in clear text.
const dbSslEnabled = readBoolean('DB_SSL', false);
const dbSslRejectUnauthorized = readBoolean('DB_SSL_REJECT_UNAUTHORIZED', true);

function readPemFile(name) {
  const filePath = process.env[name];

  if (!filePath) {
    return null;
  }

  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    errors.push(`${name} could not be read (${error.code || 'file error'})`);
    return null;
  }
}

const dbSslCa = dbSslEnabled ? readPemFile('DB_SSL_CA') : null;
const dbSslCert = dbSslEnabled ? readPemFile('DB_SSL_CERT') : null;
const dbSslKey = dbSslEnabled ? readPemFile('DB_SSL_KEY') : null;

const dbSsl = dbSslEnabled
  ? {
      rejectUnauthorized: dbSslRejectUnauthorized,
      ...(dbSslCa ? { ca: dbSslCa } : {}),
      ...(dbSslCert ? { cert: dbSslCert } : {}),
      ...(dbSslKey ? { key: dbSslKey } : {}),
    }
  : false;

const db = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: dbPort,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'campus_kabar',
  ssl: dbSsl,
};

const localDbHosts = new Set(['127.0.0.1', 'localhost', '::1']);

if (isProduction && !localDbHosts.has(db.host) && !dbSslEnabled) {
  errors.push(
    'DB_SSL must be true when NODE_ENV=production and DB_HOST is not localhost',
  );
}

// Local development may rely on defaults; a deployed process must be explicit
// so it can never silently connect to a default database with a blank password.
if (isProduction) {
  for (const name of ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']) {
    if (!process.env[name]) {
      errors.push(`${name} is required when NODE_ENV=production`);
    }
  }

  if (!process.env.CORS_ORIGIN) {
    errors.push('CORS_ORIGIN is required when NODE_ENV=production');
  }

  for (const origin of corsOrigins) {
    try {
      const parsed = new URL(origin);
      if (parsed.protocol !== 'https:') {
        errors.push(`CORS_ORIGIN entries must use https in production; got "${origin}"`);
      }
      if (localDbHosts.has(parsed.hostname)) {
        errors.push(`CORS_ORIGIN must not use localhost in production; got "${origin}"`);
      }
    } catch {
      errors.push(`CORS_ORIGIN contains an invalid origin; got "${origin}"`);
    }
  }
}

// --- Authentication -------------------------------------------------------

const configuredAccessSecret = process.env.JWT_ACCESS_SECRET || '';
const secretIsStrong = configuredAccessSecret.length >= MIN_SECRET_LENGTH;

if (isProduction && !secretIsStrong) {
  errors.push(
    `JWT_ACCESS_SECRET is required when NODE_ENV=production and must be at least ${MIN_SECRET_LENGTH} characters`,
  );
}

if (!isProduction && configuredAccessSecret.length > 0 && !secretIsStrong) {
  errors.push(
    `JWT_ACCESS_SECRET must be at least ${MIN_SECRET_LENGTH} characters when provided`,
  );
}

const usingInsecureDevSecret = !isProduction && !secretIsStrong;

const accessSecret = usingInsecureDevSecret
  ? DEV_ACCESS_SECRET
  : configuredAccessSecret;

const accessTokenTtlSeconds = readDuration('ACCESS_TOKEN_TTL', 15 * 60, {
  min: MIN_ACCESS_TOKEN_TTL_SECONDS,
  max: 60 * 60,
});

const refreshTokenTtlSeconds = readDuration('REFRESH_TOKEN_TTL', 7 * 86400, {
  min: MIN_REFRESH_TOKEN_TTL_SECONDS,
  max: MAX_REFRESH_TOKEN_TTL_SECONDS,
});

const cookieName = process.env.COOKIE_NAME || 'ck_refresh';

if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(cookieName)) {
  errors.push(
    `COOKIE_NAME must be a valid cookie token (no spaces or separators); got "${cookieName}"`,
  );
}

const cookieSameSite = (process.env.COOKIE_SAMESITE || 'lax')
  .trim()
  .toLowerCase();

if (!VALID_SAME_SITE.includes(cookieSameSite)) {
  errors.push(
    `COOKIE_SAMESITE must be one of ${VALID_SAME_SITE.join(', ')}; got "${cookieSameSite}"`,
  );
}

// Secure defaults to true in production. A deployment may terminate TLS in
// front of the API, but the browser-facing cookie must still be Secure.
const cookieSecure = readBoolean('COOKIE_SECURE', isProduction);

if (isProduction && !cookieSecure) {
  errors.push('COOKIE_SECURE must be true when NODE_ENV=production');
}

if (cookieSameSite === 'none' && !cookieSecure) {
  errors.push('COOKIE_SAMESITE=none requires COOKIE_SECURE=true');
}

const cookieDomain = process.env.COOKIE_DOMAIN || undefined;

// Express' `trust proxy` setting. Needed for correct client IPs behind a
// reverse proxy (rate limiting) and for Secure cookies when TLS terminates
// upstream. Accepts true/false, a hop count, or a comma-separated list of
// addresses/subnets such as "loopback".
function readTrustProxy() {
  const raw = process.env.TRUST_PROXY;

  if (raw === undefined || raw === '') {
    return false;
  }

  const normalized = raw.trim().toLowerCase();

  if (['false', '0', 'no'].includes(normalized)) {
    return false;
  }

  if (['true', 'yes'].includes(normalized)) {
    return true;
  }

  if (/^\d+$/.test(normalized)) {
    return Number(normalized);
  }

  return normalized.split(',').map((entry) => entry.trim()).filter(Boolean);
}

const trustProxy = readTrustProxy();

// --- Cloudinary (media storage) ------------------------------------------
// All three values are required to enable uploads. When any is missing the
// media endpoints report "not configured" instead of crashing startup, so
// local development and tests work without Cloudinary credentials.
const cloudinaryCloudName = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
const cloudinaryApiKey = (process.env.CLOUDINARY_API_KEY || '').trim();
const cloudinaryApiSecret = (process.env.CLOUDINARY_API_SECRET || '').trim();
const cloudinaryFolder = (process.env.CLOUDINARY_UPLOAD_FOLDER || 'campus-kabar').trim();

const cloudinaryConfigured = Boolean(
  cloudinaryCloudName && cloudinaryApiKey && cloudinaryApiSecret,
);

if (isProduction && !cloudinaryConfigured) {
  errors.push(
    'CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET are required when NODE_ENV=production',
  );
}

// --- Rate limiting -------------------------------------------------------
// Applied to authentication endpoints. In test mode the limit is effectively
// disabled so the suite stays deterministic. In development the default is
// generous to avoid blocking repeated local testing; override with env vars.
// A dev-only kill switch (RATE_LIMIT_DISABLED) is honoured only outside
// production so it can never weaken a deployed instance.
const rateLimitWindowMs = 15 * 60 * 1000;

function readRateLimitMax(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    errors.push(`${name} must be a positive integer; got "${raw}"`);
    return fallback;
  }
  return value;
}

const loginRateLimitMax = isTest
  ? 100000
  : readRateLimitMax('LOGIN_RATE_LIMIT_MAX', isProduction ? 10 : 100);

const authRateLimitMax = isTest
  ? 100000
  : readRateLimitMax('AUTH_RATE_LIMIT_MAX', isProduction ? 100 : 1000);

const rateLimitDisabled =
  !isProduction && process.env.RATE_LIMIT_DISABLED === 'true';

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
  isTest,
  port,
  corsOrigins: Object.freeze(corsOrigins),
  publicSiteUrl,
  db: Object.freeze(db),
  trustProxy,
  auth: Object.freeze({
    accessSecret,
    usingInsecureDevSecret,
    accessTokenTtlSeconds,
    refreshTokenTtlSeconds,
    cookie: Object.freeze({
      name: cookieName,
      path: '/api/auth',
      sameSite: cookieSameSite,
      secure: cookieSecure,
      domain: cookieDomain,
      maxAgeMs: refreshTokenTtlSeconds * 1000,
    }),
  }),
  rateLimit: Object.freeze({
    windowMs: rateLimitWindowMs,
    loginMax: loginRateLimitMax,
    authMax: authRateLimitMax,
    disabled: rateLimitDisabled,
  }),
  cloudinary: Object.freeze({
    configured: cloudinaryConfigured,
    cloudName: cloudinaryCloudName,
    apiKey: cloudinaryApiKey,
    apiSecret: cloudinaryApiSecret,
    folder: cloudinaryFolder,
  }),
});
