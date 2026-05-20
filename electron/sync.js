const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { net } = require('electron');
const { getPaths, loadApiConfig, readJson } = require('./sync-config');

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
    accounts: {},
    usersLastSyncedAt: null,
    pendingUserDeletions: [],
  };
}

function ensureAccountMeta(meta, accountId) {
  if (!meta.accounts || typeof meta.accounts !== 'object') {
    meta.accounts = {};
  }
  if (!meta.accounts[accountId]) {
    meta.accounts[accountId] = {
      lastSyncedAt: null,
      pendingDeletions: [],
    };
  }
  if (!Array.isArray(meta.accounts[accountId].pendingDeletions)) {
    meta.accounts[accountId].pendingDeletions = [];
  }

  if (
    meta.accounts[accountId].pendingDeletions.length === 0 &&
    Array.isArray(meta.pendingDeletions) &&
    meta.pendingDeletions.length > 0
  ) {
    meta.accounts[accountId].pendingDeletions = [...meta.pendingDeletions];
    meta.pendingDeletions = [];
  }

  return meta.accounts[accountId];
}

function parseErrorMessage(body, status) {
  const text = String(body ?? '').trim();
  if (!text) {
    return `Sync failed (${status})`;
  }
  try {
    const json = JSON.parse(text);
    return json.error || json.message || text;
  } catch {
    return text;
  }
}

function studentsForAccountSync(database, accountId) {
  return database.exportStudentsForSync(accountId).map((student) => ({
    ...student,
    ownerId: accountId,
  }));
}

function setStatus(patch) {
  lastStatus = { ...lastStatus, ...patch, at: new Date().toISOString() };
  notifyStatus?.(lastStatus);
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf8' });
}

async function loadConfig() {
  return loadApiConfig();
}

async function resolveSyncContext() {
  const config = await loadConfig();
  if (!config) {
    return null;
  }

  const auth = getAuthRef ? await getAuthRef() : null;
  const session = auth?.getSession?.() ?? auth?.session ?? null;
  if (!session?.id) {
    return null;
  }

  return {
    ...config,
    gymId: session.id,
    ownerId: session.id,
    accountId: session.id,
    username: session.username,
  };
}

async function loadMeta() {
  const { metaPath } = getPaths();
  const meta = await readJson(metaPath, defaultMeta());
  if (!meta.deviceId) {
    meta.deviceId = crypto.randomUUID();
  }
  if (!meta.accounts || typeof meta.accounts !== 'object') {
    meta.accounts = {};
  }
  if (!Array.isArray(meta.pendingUserDeletions)) {
    meta.pendingUserDeletions = [];
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
    changed = records.filter((record) => new Date(record.updatedAt).getTime() >= sinceMs);
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
  const config = await resolveSyncContext();
  if (!config?.ownerId) {
    return;
  }

  const meta = await loadMeta();
  const account = ensureAccountMeta(meta, config.ownerId);
  const deletedAt = new Date().toISOString();
  const existing = account.pendingDeletions.find((entry) => entry.id === studentId);
  if (existing) {
    existing.deletedAt = deletedAt;
  } else {
    account.pendingDeletions.push({ id: studentId, deletedAt });
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
  const force = Boolean(options.force);

  if (syncing) {
    return toCloudSyncResult(lastStatus);
  }

  const baseConfig = await loadConfig();
  const config = await resolveSyncContext();
  if (!config) {
    if (baseConfig) {
      setStatus({
        status: 'error',
        configured: true,
        online: isOnline(),
        message: 'Sign in to sync your account data to the cloud',
      });
    } else {
      setStatus({ status: 'disabled', configured: false, online: isOnline() });
    }
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
    accountId: config.accountId,
    message: 'Syncing your account data with cloud…',
  });

  try {
    const meta = await loadMeta();
    const account = ensureAccountMeta(meta, config.ownerId);
    const localStudents = studentsForAccountSync(database, config.ownerId);
    const changedStudents = force
      ? localStudents
      : recordsChangedSince(localStudents, account.lastSyncedAt);
    const localUsers = auth ? auth.exportUsersForSync() : [];
    const usersForAccount = localUsers.filter((user) => user.id === config.ownerId);
    const changedUsers = recordsChangedSince(
      usersForAccount,
      meta.usersLastSyncedAt,
      ensureUserIds
    );

    const response = await fetchWithTimeout(`${config.apiUrl}/api/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        gymId: config.gymId,
        deviceId: meta.deviceId,
        since: account.lastSyncedAt,
        students: changedStudents,
        deletions: account.pendingDeletions,
        users: changedUsers,
        userDeletions: meta.pendingUserDeletions ?? [],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(parseErrorMessage(body, response.status));
    }

    const payload = await response.json();
    const studentsMerged = await database.applySyncMerge(
      payload.students,
      payload.deletions,
      config.ownerId
    );
    const usersMerged = auth
      ? await auth.applySyncMerge(payload.users, payload.userDeletions)
      : false;
    const merged = studentsMerged || usersMerged;

    account.lastSyncedAt = payload.serverTime || new Date().toISOString();
    account.pendingDeletions = account.pendingDeletions.filter(
      (pending) =>
        !payload.deletions?.some(
          (remote) => remote.id === pending.id && remote.deletedAt >= pending.deletedAt
        )
    );
    meta.usersLastSyncedAt = payload.serverTime || new Date().toISOString();
    if (Array.isArray(meta.pendingUserDeletions)) {
      meta.pendingUserDeletions = meta.pendingUserDeletions.filter(
        (pending) =>
          !payload.userDeletions?.some(
            (remote) => remote.id === pending.id && remote.deletedAt >= pending.deletedAt
          )
      );
    }
    await saveMeta(meta);

    const pushed = changedStudents.length;
    let message = 'Up to date';
    if (pushed > 0) {
      message = `Saved ${pushed} student${pushed === 1 ? '' : 's'} to cloud for this account`;
    } else if (merged) {
      message = 'Cloud sync updated local data';
    }

    setStatus({
      status: 'synced',
      configured: true,
      online: true,
      lastSyncedAt: account.lastSyncedAt,
      accountId: config.accountId,
      merged,
      pushed,
      message,
    });
  } catch (error) {
    const offlineLike =
      error.name === 'AbortError' ||
      error.cause?.code === 'ENOTFOUND' ||
      error.cause?.code === 'ECONNREFUSED' ||
      /fetch failed/i.test(String(error.message));

    setStatus({
      status: offlineLike ? 'offline' : 'error',
      configured: true,
      online: isOnline(),
      accountId: config.accountId,
      message: offlineLike
        ? 'Cannot reach sync server — changes saved locally'
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
    .then(async (baseConfig) => {
      const syncContext = baseConfig ? await resolveSyncContext() : null;
      setStatus({
        status: syncContext ? 'idle' : baseConfig ? 'disabled' : 'disabled',
        configured: Boolean(baseConfig),
        online: isOnline(),
        message: baseConfig && !syncContext ? 'Sign in to sync your account data' : undefined,
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
  const { requireAuthSession } = require('./auth');

  ipcMain.handle('sync:get-status', () => lastStatus);
  ipcMain.handle('sync:run', async () => {
    await requireAuthSession();
    return runSync({ force: true });
  });
  ipcMain.handle('sync:get-config', async () => {
    const config = await resolveSyncContext();
    if (!config) {
      const baseConfig = await loadConfig();
      if (!baseConfig) {
        return { enabled: false };
      }
      return { enabled: true, apiUrl: baseConfig.apiUrl, gymId: null };
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
