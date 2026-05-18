const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { app, net } = require('electron');

const SYNC_DEBOUNCE_MS = 2500;
const SYNC_INTERVAL_MS = 60000;
const SYNC_TIMEOUT_MS = 30000;

let syncTimer = null;
let intervalHandle = null;
let syncing = false;
let lastStatus = { status: 'idle', configured: false };
let notifyStatus = null;
let getDatabaseRef = null;
let getAuthRef = null;

function defaultMeta() {
  return {
    deviceId: crypto.randomUUID(),
    lastSyncedAt: null,
    pendingDeletions: [],
    pendingUserDeletions: [],
  };
}

function setStatus(patch) {
  lastStatus = { ...lastStatus, ...patch, at: new Date().toISOString() };
  notifyStatus?.(lastStatus);
}

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

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf8' });
}

function getPaths() {
  const userData = app.getPath('userData');
  return {
    configPath: path.join(userData, 'gym-sync-config.json'),
    metaPath: path.join(userData, 'gym-sync-meta.json'),
  };
}

async function loadConfig() {
  const { configPath } = getPaths();
  const config = await readJson(configPath, null);
  if (!config?.enabled) {
    return null;
  }

  const apiUrl = String(config.apiUrl ?? '').trim().replace(/\/$/, '');
  const apiKey = String(config.apiKey ?? '').trim();
  const gymId = String(config.gymId ?? '').trim();

  if (!apiUrl || !apiKey || !gymId) {
    return null;
  }

  return { apiUrl, apiKey, gymId };
}

async function loadMeta() {
  const { metaPath } = getPaths();
  const meta = await readJson(metaPath, defaultMeta());
  if (!meta.deviceId) {
    meta.deviceId = crypto.randomUUID();
  }
  if (!Array.isArray(meta.pendingDeletions)) {
    meta.pendingDeletions = [];
  }
  return meta;
}

async function saveMeta(meta) {
  const { metaPath } = getPaths();
  await writeJson(metaPath, meta);
}

function isOnline() {
  return net.isOnline();
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function recordsChangedSince(records, sinceIso, ensureIds = []) {
  const ensureSet = new Set(ensureIds);
  let changed;

  if (!sinceIso) {
    changed = [...records];
  } else {
    const sinceMs = new Date(sinceIso).getTime();
    changed = records.filter((record) => new Date(record.updatedAt).getTime() > sinceMs);
  }

  const seen = new Set(changed.map((record) => record.id));
  for (const record of records) {
    if (ensureSet.has(record.id) && !seen.has(record.id)) {
      changed.push(record);
      seen.add(record.id);
    }
  }

  return changed;
}

async function recordDeletion(studentId) {
  const meta = await loadMeta();
  const deletedAt = new Date().toISOString();
  const existing = meta.pendingDeletions.find((entry) => entry.id === studentId);
  if (existing) {
    existing.deletedAt = deletedAt;
  } else {
    meta.pendingDeletions.push({ id: studentId, deletedAt });
  }
  await saveMeta(meta);
  scheduleSync();
}

function toCloudSyncResult(status) {
  if (!status?.configured) {
    return {
      status: 'disabled',
      message: 'Cloud sync is not configured. Add gym-sync-config.json in AppData.',
    };
  }
  if (status.status === 'synced') {
    return { status: 'synced', message: 'Account saved to MongoDB.' };
  }
  if (status.status === 'offline') {
    return {
      status: 'offline',
      message: 'Account saved locally. Will sync to MongoDB when you are online.',
    };
  }
  return {
    status: 'error',
    message: status.message || 'Could not save account to MongoDB.',
  };
}

async function runSync(options = {}) {
  const ensureUserIds = options.ensureUserIds ?? [];

  if (syncing) {
    return toCloudSyncResult(lastStatus);
  }

  const config = await loadConfig();
  if (!config) {
    setStatus({ status: 'disabled', configured: false, online: isOnline() });
    return toCloudSyncResult(lastStatus);
  }

  if (!isOnline()) {
    setStatus({
      status: 'offline',
      configured: true,
      online: false,
      message: 'Offline — changes saved locally',
    });
    return toCloudSyncResult(lastStatus);
  }

  const database = await getDatabaseRef();
  const auth = getAuthRef ? await getAuthRef() : null;
  if (!database) {
    return toCloudSyncResult(lastStatus);
  }

  syncing = true;
  setStatus({
    status: 'syncing',
    configured: true,
    online: true,
    message: 'Syncing with cloud…',
  });

  try {
    const meta = await loadMeta();
    const localStudents = database.exportStudentsForSync();
    const changedStudents = recordsChangedSince(localStudents, meta.lastSyncedAt);
    const localUsers = auth ? auth.exportUsersForSync() : [];
    const changedUsers = recordsChangedSince(localUsers, meta.lastSyncedAt, ensureUserIds);

    const response = await fetchWithTimeout(`${config.apiUrl}/api/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        gymId: config.gymId,
        deviceId: meta.deviceId,
        since: meta.lastSyncedAt,
        students: changedStudents,
        deletions: meta.pendingDeletions,
        users: changedUsers,
        userDeletions: meta.pendingUserDeletions ?? [],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(body || `Sync failed (${response.status})`);
    }

    const payload = await response.json();
    const studentsMerged = await database.applySyncMerge(payload.students, payload.deletions);
    const usersMerged = auth
      ? await auth.applySyncMerge(payload.users, payload.userDeletions)
      : false;
    const merged = studentsMerged || usersMerged;

    meta.lastSyncedAt = payload.serverTime || new Date().toISOString();
    meta.pendingDeletions = meta.pendingDeletions.filter(
      (pending) =>
        !payload.deletions?.some(
          (remote) => remote.id === pending.id && remote.deletedAt >= pending.deletedAt
        )
    );
    if (Array.isArray(meta.pendingUserDeletions)) {
      meta.pendingUserDeletions = meta.pendingUserDeletions.filter(
        (pending) =>
          !payload.userDeletions?.some(
            (remote) => remote.id === pending.id && remote.deletedAt >= pending.deletedAt
          )
      );
    }
    await saveMeta(meta);

    setStatus({
      status: 'synced',
      configured: true,
      online: true,
      lastSyncedAt: meta.lastSyncedAt,
      merged,
      message: merged ? 'Cloud sync updated local data' : 'Up to date',
    });
  } catch (error) {
    const offlineLike =
      error.name === 'AbortError' ||
      error.cause?.code === 'ENOTFOUND' ||
      error.cause?.code === 'ECONNREFUSED';

    setStatus({
      status: offlineLike ? 'offline' : 'error',
      configured: true,
      online: isOnline(),
      message: offlineLike
        ? 'Offline — changes saved locally'
        : error.message || 'Sync failed',
    });
  } finally {
    syncing = false;
  }

  return toCloudSyncResult(lastStatus);
}

function scheduleSync() {
  if (syncTimer) {
    clearTimeout(syncTimer);
  }

  syncTimer = setTimeout(() => {
    syncTimer = null;
    runSync().catch((error) => {
      console.error('Background sync failed:', error);
    });
  }, SYNC_DEBOUNCE_MS);
}

function setupSync({ getDatabase, getAuth, onStatus }) {
  getDatabaseRef = getDatabase;
  getAuthRef = getAuth;
  notifyStatus = onStatus;

  loadConfig()
    .then((config) => {
      setStatus({
        status: config ? 'idle' : 'disabled',
        configured: Boolean(config),
        online: isOnline(),
      });
    })
    .catch((error) => console.error('Failed to load sync config:', error));

  intervalHandle = setInterval(() => {
    scheduleSync();
  }, SYNC_INTERVAL_MS);

  app.on('online', scheduleSync);
  app.on('offline', () => {
    setStatus({
      status: 'offline',
      configured: Boolean(lastStatus.configured),
      online: false,
      message: 'Offline — changes saved locally',
    });
  });
}

function disposeSync() {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

function registerSyncHandlers(ipcMain) {
  ipcMain.handle('sync:get-status', () => lastStatus);
  ipcMain.handle('sync:run', () => runSync());
  ipcMain.handle('sync:get-config', async () => {
    const config = await loadConfig();
    if (!config) {
      return { enabled: false };
    }
    return {
      enabled: true,
      apiUrl: config.apiUrl,
      gymId: config.gymId,
    };
  });
}

module.exports = {
  setupSync,
  disposeSync,
  scheduleSync,
  recordDeletion,
  registerSyncHandlers,
  runSync,
  toCloudSyncResult,
};
