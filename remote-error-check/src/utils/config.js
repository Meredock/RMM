const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG_PATH = path.join(process.cwd(), 'config', 'default.json');

function loadConfig(configPath = DEFAULT_CONFIG_PATH) {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }
  const raw = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(raw);
}

module.exports = { loadConfig };
