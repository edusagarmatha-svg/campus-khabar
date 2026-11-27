const http = require('node:http');

let env;
let app;
let db;
let storageService;

try {
  env = require('./config/env');
  app = require('./app');
  db = require('./db/knex');
  storageService = require('./services/storageService');
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
  console.log(`[server] media volume: ${env.storage.root}`);
  console.log(
    env.frontend.available
      ? `[server] serving frontend bundle from ${env.frontend.distPath}`
      : '[server] no frontend bundle found; serving the API only',
  );

  // A process killed mid-upload can leave a partial file in the volume's tmp
  // directory. Clearing those at boot keeps the volume from accumulating
  // bytes nobody can reach. Failure here must not stop the server.
  storageService
    .pruneTempFiles()
    .then((removed) => {
      if (removed > 0) {
        console.log(`[server] removed ${removed} abandoned upload file(s)`);
      }
    })
    .catch((error) => {
      console.error(`[server] temporary upload cleanup failed: ${error.message}`);
    });
});
