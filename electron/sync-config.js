const fs = require('fs').promises;
const path = require('path');
const { app } = require('electron');

let buildConfigCache = null;

function parseJsonText(raw) {
  const text = raw.replace(/^\uFEFF/, '').trim();
  return JSON.parse(text);
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return parseJsonText(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallback;
    }
    throw error;
  }
}

async function loadBuildConfig() {
  if (buildConfigCache) {
    return buildConfigCache;
  }

  const buildPath = path.join(__dirname, 'build-config.json');
  try {
    buildConfigCache = await readJson(buildPath, {});
  } catch {
    buildConfigCache = {};
  }

  return buildConfigCache;
}

function getPaths() {
  const userData = app.getPath('userData');
  return {
    configPath: path.join(userData, 'gym-sync-config.json'),
    metaPath: path.join(userData, 'gym-sync-meta.json'),
  };
}

function normalizeApiUrl(value) {
  return String(value ?? '').trim().replace(/\/$/, '');
}

function normalizeApiKey(value) {
  return String(value ?? '').trim();
}

async function loadApiConfig() {
  const build = await loadBuildConfig();
  const { configPath } = getPaths();
  const fileConfig = await readJson(configPath, null);

  if (fileConfig?.enabled === false) {
    return null;
  }

  const apiUrl = normalizeApiUrl(
    fileConfig?.apiUrl ?? build.apiUrl ?? process.env.BACKEND_URL ?? process.env.GYM_API_URL
  );
  const apiKey = normalizeApiKey(
    fileConfig?.apiKey ?? build.apiKey ?? process.env.SYNC_API_KEY ?? process.env.GYM_API_KEY
  );

  if (!apiUrl || !apiKey) {
    return null;
  }

  return { apiUrl, apiKey, source: fileConfig ? 'user' : 'build' };
}

async function ensureUserSyncConfig() {
  const existing = await loadApiConfig();
  if (existing?.source === 'user') {
    return existing;
  }

  const build = await loadBuildConfig();
  const apiUrl = normalizeApiUrl(build.apiUrl);
  const apiKey = normalizeApiKey(build.apiKey);

  if (!apiUrl || !apiKey) {
    return existing;
  }

  const { configPath } = getPaths();
  const current = await readJson(configPath, null);
  if (current?.apiUrl && current?.apiKey) {
    return loadApiConfig();
  }

  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(
    configPath,
    `${JSON.stringify(
      {
        enabled: true,
        apiUrl,
        apiKey,
      },
      null,
      2
    )}\n`,
    'utf8'
  );

  buildConfigCache = null;
  return loadApiConfig();
}

module.exports = {
  getPaths,
  loadApiConfig,
  ensureUserSyncConfig,
  readJson,
};
