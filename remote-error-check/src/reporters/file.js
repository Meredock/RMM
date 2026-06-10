const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

function writeReport(results, outputPath) {
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: results.length,
      passed: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
    },
    results,
  };

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
  logger.info(`Report written to ${outputPath}`);
}

module.exports = { writeReport };
