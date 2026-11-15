import { loadConfig } from './config.js';
import { buildApp } from './app.js';

async function start() {
  const config = loadConfig();
  const app = await buildApp(config);

  try {
    await app.listen({ port: config.PORT, host: config.HOST });
    app.log.info(
      { corsOrigins: config.corsOrigins, authRequired: config.AUTH_REQUIRED },
      `Gateway running on port ${config.PORT}`
    );
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
