const express = require('express');
const cors = require('cors');

const env = require('./config/env');
const db = require('./db/knex');

const app = express();

// Do not advertise the framework in responses.
app.disable('x-powered-by');

// Only the configured frontend origins may call the API from a browser.
app.use(cors({ origin: env.corsOrigins }));

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

  if (status >= 500) {
    console.error('[api] unhandled error:', error);
  }

  res.status(status).json({
    error: {
      code: status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR',
      message:
        status >= 500 ? 'An unexpected error occurred' : error.message,
    },
  });
});

module.exports = app;
