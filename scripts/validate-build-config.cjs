const fs = require('fs');
const path = require('path');
const defaults = require('../config/api-defaults.cjs');

const configPath = path.join(__dirname, '..', 'electron', 'build-config.json');

let config = {};
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch {
  console.error('Missing electron/build-config.json — run npm run build first.');
  process.exit(1);
}

if (!config.apiUrl || !config.apiKey) {
  console.error('Build config incomplete — run npm run generate-build-config');
  process.exit(1);
}

console.log(`Build config OK — apiUrl=${config.apiUrl}`);

if (config.apiKey !== defaults.SYNC_API_KEY) {
  console.log('Using custom SYNC_API_KEY from .env');
}
