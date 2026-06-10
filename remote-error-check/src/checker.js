const axios = require('axios');
const logger = require('./utils/logger');
const { reportResults } = require('./reporters/console');
const { writeReport } = require('./reporters/file');

async function checkEndpoint(endpoint) {
  const start = Date.now();
  try {
    const response = await axios.get(endpoint.url, {
      timeout: endpoint.timeout || 5000,
      validateStatus: null,
    });
    const duration = Date.now() - start;
    const ok = endpoint.expectedStatus
      ? response.status === endpoint.expectedStatus
      : response.status < 400;

    return {
      url: endpoint.url,
      status: response.status,
      duration,
      ok,
      error: null,
    };
  } catch (err) {
    return {
      url: endpoint.url,
      status: null,
      duration: Date.now() - start,
      ok: false,
      error: err.message,
    };
  }
}

async function runChecks(config) {
  const results = await Promise.all(config.endpoints.map(checkEndpoint));

  const failed = results.filter((r) => !r.ok);
  const passed = results.filter((r) => r.ok);

  logger.info(`Check complete — ${passed.length} passed, ${failed.length} failed`);

  reportResults(results);

  if (config.outputFile) {
    writeReport(results, config.outputFile);
  }

  return results;
}

module.exports = { runChecks, checkEndpoint };
