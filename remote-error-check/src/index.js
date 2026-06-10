const cron = require('node-cron');
const { loadConfig } = require('./utils/config');
const { runChecks } = require('./checker');
const logger = require('./utils/logger');

async function main() {
  const config = loadConfig();
  logger.info(`Remote Error Check started — monitoring ${config.endpoints.length} endpoint(s)`);

  // Run immediately on start
  await runChecks(config);

  if (config.schedule) {
    cron.schedule(config.schedule, async () => {
      logger.info('Running scheduled check...');
      await runChecks(config);
    });
    logger.info(`Scheduled to run: ${config.schedule}`);
  }
}

main().catch((err) => {
  logger.error('Fatal error:', err.message);
  process.exit(1);
});
