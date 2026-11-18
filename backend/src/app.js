const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const env = require('./config/env');
const db = require('./db/knex');
const authRoutes = require('./routes/authRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const postRoutes = require('./routes/postRoutes');
const postRevisionRoutes = require('./routes/postRevisionRoutes');
const mediaRoutes = require('./routes/mediaRoutes');
const userRoutes = require('./routes/userRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');

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

app.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `No route for ${req.method} ${req.originalUrl}`,
    },
  });
});

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  if (res.headersSent) {
    return next(error);
  }

  const status = Number.isInteger(error.status) ? error.status : 500;
  const code =
    (typeof error.code === 'string' && error.code) ||
    (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR');

  if (status >= 500) {
    console.error('[api] unhandled error:', error);
  }

  res.status(status).json({
    error: {
      code,
      message:
        status >= 500
          ? 'An unexpected error occurred'
          : error.message || 'Request failed',
    },
  });
});

module.exports = app;
