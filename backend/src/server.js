const http = require('node:http');

let env;
let app;
let db;

try {
  env = require('./config/env');
  app = require('./app');
  db = require('./db/knex');
} catch (error) {
  // Configuration and connection-module failures must stop the process with a
  // readable reason instead of a late, confusing crash.
  console.error(`[server] startup failed: ${error.message}`);
  process.exit(1);
}

const server = http.createServer(app);

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`[server] ${signal} received; shutting down`);

  const forceExit = setTimeout(() => {
    console.error('[server] shutdown timed out after 10s; exiting');
    process.exit(1);
  }, 10_000);

  forceExit.unref();

  server.close(async (closeError) => {
    if (closeError) {
      console.error(`[server] HTTP server close failed: ${closeError.message}`);
    }

    try {
      await db.destroy();
      console.log('[server] database pool closed');
    } catch (error) {
      console.error(`[server] database pool close failed: ${error.message}`);
    }

    clearTimeout(forceExit);
    process.exit(closeError ? 1 : 0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

server.on('error', (error) => {
  console.error(`[server] failed to start: ${error.message}`);
  process.exit(1);
});

server.listen(env.port, () => {
  console.log(
    `[server] Campus Kabar API listening on port ${env.port} (${env.nodeEnv})`,
  );
});
