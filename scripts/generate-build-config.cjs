const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env');
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

function normalizeApiUrl(value) {
  return String(value ?? '').trim().replace(/\/$/, '');
}

let env = {};
if (fs.existsSync(envPath)) {
  env = parseEnvFile(fs.readFileSync(envPath, 'utf8'));
}

const apiUrl = normalizeApiUrl(env.BACKEND_URL || env.GYM_API_URL);
const apiKey = String(env.SYNC_API_KEY || env.GYM_API_KEY || '').trim();

const config = {};
if (apiUrl) {
  config.apiUrl = apiUrl;
}
if (apiKey) {
  config.apiKey = apiKey;
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

if (apiUrl && apiKey) {
  console.log(`Wrote build config with apiUrl=${apiUrl}`);
} else if (apiUrl) {
  console.warn('Wrote build config with apiUrl only — add SYNC_API_KEY to .env for cloud sign-in');
} else {
  console.warn('No BACKEND_URL in .env — cloud sign-in will need gym-sync-config.json in AppData');
}
