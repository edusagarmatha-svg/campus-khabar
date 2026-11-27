const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const env = require('./config/env');
const db = require('./db/knex');
const { isHttpError } = require('./utils/errors');
const authRoutes = require('./routes/authRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const postRoutes = require('./routes/postRoutes');
const postRevisionRoutes = require('./routes/postRevisionRoutes');
const mediaRoutes = require('./routes/mediaRoutes');
const userRoutes = require('./routes/userRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const seoRoutes = require('./routes/seoRoutes');

const app = express();

// Respect X-Forwarded-* headers per configuration (needed behind a proxy).
app.set('trust proxy', env.trustProxy);

// Do not advertise the framework in responses.
app.disable('x-powered-by');

// Security headers.
app.use(helmet());

// Only the configured frontend origins may call the API from a browser, with
// credentials so the HttpOnly refresh-token cookie is sent.
app.use(
  cors({
    origin: env.corsOrigins,
    credentials: true,
  }),
);

app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

app.get('/api/health', async (req, res) => {
  try {
    await db.raw('SELECT 1');

    res.status(200).json({
      status: 'ok',
      service: 'campus-kabar-api',
      database: 'up',
      uptime_seconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(`[api] health check failed: ${error.message}`);

    res.status(503).json({
      status: 'error',
      service: 'campus-kabar-api',
      database: 'down',
      message: 'Database health check failed',
      timestamp: new Date().toISOString(),
    });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/post-revisions', postRevisionRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin/dashboard', dashboardRoutes);

// Public SEO files are served from the API so they can be generated from the
// live database. A reverse proxy should expose these at the site root.
app.use('/', seoRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'The requested resource was not found',
    },
  });
});

// Deliberately generic messages for errors that did not originate from an
// HttpError. This keeps parser, database and framework details out of 4xx
// responses while still allowing service-layer validation messages.
const SAFE_4XX_MESSAGES = {
  400: 'Invalid request',
  401: 'Authentication required',
  403: 'Forbidden',
  404: 'Not found',
  405: 'Method not allowed',
  409: 'Request conflicts with the current state',
  413: 'Request body is too large',
  415: 'Unsupported media type',
  422: 'Invalid request',
  429: 'Too many requests',
};

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  let status;
  let code;
  let message;

  if (isHttpError(error)) {
    status = error.status;
    code = error.code;
    message = error.message;
  } else {
    status = Number.isInteger(error.status) ? error.status : 500;
    code = status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR';
    message =
      status >= 500
        ? 'An unexpected error occurred'
        : SAFE_4XX_MESSAGES[status] || 'Request failed';
  }

  if (status >= 500) {
    console.error('[api] unhandled error:', error);
  }

  res.status(status).json({
    error: { code, message },
  });
});

module.exports = app;
