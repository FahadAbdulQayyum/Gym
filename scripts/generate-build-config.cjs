const fs = require('fs');
const path = require('path');
const defaults = require('../config/api-defaults.cjs');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');
const serverEnvPath = path.join(root, 'server', '.env');
const outPath = path.join(root, 'electron', 'build-config.json');

function parseEnvFile(raw) {
  const values = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function loadEnvFiles() {
  const merged = {};
  if (fs.existsSync(serverEnvPath)) {
    Object.assign(merged, parseEnvFile(fs.readFileSync(serverEnvPath, 'utf8')));
  }
  if (fs.existsSync(envPath)) {
    Object.assign(merged, parseEnvFile(fs.readFileSync(envPath, 'utf8')));
  }
  return merged;
}

function normalizeApiUrl(value) {
  let url = String(value ?? '').trim().replace(/\/$/, '');
  if (url.endsWith('/api')) {
    url = url.slice(0, -4);
    console.warn('BACKEND_URL should not end with /api — trimmed for build config');
  }
  return url;
}

const env = loadEnvFiles();
const apiUrl = normalizeApiUrl(
  env.BACKEND_URL || env.GYM_API_URL || defaults.BACKEND_URL
);
const apiKey = String(
  env.SYNC_API_KEY || env.GYM_API_KEY || defaults.SYNC_API_KEY
).trim();

const config = { apiUrl, apiKey };

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
console.log(`Wrote build config with apiUrl=${apiUrl}`);
