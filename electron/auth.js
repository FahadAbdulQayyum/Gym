const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');
const { cloudLogin, cloudSignup, cloudRegister, isNetworkError } = require('./cloud-auth');
const { loadApiConfig } = require('./sync-config');

function newId() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, 'sha256');
  return {
    salt: salt.toString('base64'),
    hash: hash.toString('base64'),
  };
}

function verifyPassword(password, saltBase64, hashBase64) {
  const salt = Buffer.from(saltBase64, 'base64');
  const expected = Buffer.from(hashBase64, 'base64');
  const actual = crypto.pbkdf2Sync(String(password), salt, 120000, 32, 'sha256');
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

class UserDatabase {
  constructor() {
    this.filePath = null;
    this.sessionPath = null;
    this.data = { users: [] };
    this.session = null;
  }

  async init() {
    const userData = app.getPath('userData');
    this.filePath = path.join(userData, 'gym-users.json');
    this.sessionPath = path.join(userData, 'gym-session.json');
    await this.load();
    await this.seedDefaultAdmin();
    await this.loadSession();
  }

  async load() {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw);
      this.data = { users: Array.isArray(parsed.users) ? parsed.users : [] };
      this.dedupeUsersByUsername();
    } catch (error) {
      if (error.code === 'ENOENT') {
        await this.save({ skipSync: true });
        return;
      }
      throw error;
    }
  }

  dedupeUsersByUsername() {
    const byUsername = new Map();
    for (const user of this.data.users) {
      const existing = byUsername.get(user.username);
      if (!existing || new Date(user.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
        byUsername.set(user.username, user);
      }
    }
    this.data.users = [...byUsername.values()];
  }

  findUserByUsername(username) {
    const normalized = String(username ?? '').trim().toLowerCase();
    return this.data.users.find((entry) => entry.username === normalized) ?? null;
  }

  findUserById(id) {
    return this.data.users.find((entry) => entry.id === id) ?? null;
  }

  async upsertLocalUser(remoteUser) {
    const user = structuredClone(remoteUser);
    delete user.deletedAt;

    const localById = this.findUserById(user.id);
    const localByName = this.findUserByUsername(user.username);
    const local = localById ?? localByName;

    if (!local) {
      this.data.users.push(user);
    } else if (new Date(user.updatedAt).getTime() >= new Date(local.updatedAt).getTime()) {
      Object.assign(local, user);
    }

    this.dedupeUsersByUsername();
    await this.save({ skipSync: true });
    return this.findUserById(user.id) ?? this.findUserByUsername(user.username);
  }

  async save({ skipSync = false } = {}) {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
    if (!skipSync) {
      persistHook?.();
    }
  }

  async seedDefaultAdmin() {
    if (this.data.users.some((user) => user.username === 'admin')) {
      return;
    }

    const timestamp = nowIso();
    const { salt, hash } = hashPassword('admin');
    this.data.users.push({
      id: newId(),
      username: 'admin',
      passwordSalt: salt,
      passwordHash: hash,
      role: 'admin',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await this.save({ skipSync: true });
  }

  async loadSession() {
    try {
      const raw = await fs.readFile(this.sessionPath, 'utf8');
      const parsed = JSON.parse(raw);
      const user = this.data.users.find((entry) => entry.id === parsed.userId);
      if (!user) {
        this.session = null;
        return;
      }
      this.session = this.toPublicUser(user);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      this.session = null;
    }
  }

  async writeSession(user) {
    await fs.mkdir(path.dirname(this.sessionPath), { recursive: true });
    await fs.writeFile(
      this.sessionPath,
      JSON.stringify({ userId: user.id, loggedInAt: nowIso() }, null, 2),
      'utf8'
    );
    this.session = this.toPublicUser(user);
    loginHook?.();
  }

  async clearSession() {
    this.session = null;
    try {
      await fs.unlink(this.sessionPath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  toPublicUser(user) {
    return {
      id: user.id,
      username: user.username,
      role: user.role,
    };
  }

  getSession() {
    return this.session;
  }

  requireSession() {
    if (!this.session) {
      throw new Error('Sign in required');
    }
    return this.session;
  }

  validateUsername(username) {
    const normalized = String(username ?? '').trim().toLowerCase();
    if (normalized.length < 3 || normalized.length > 32) {
      throw new Error('Username must be 3–32 characters');
    }
    if (!/^[a-z0-9_]+$/.test(normalized)) {
      throw new Error('Username may only use letters, numbers, and underscores');
    }
    return normalized;
  }

  validatePassword(password) {
    const value = String(password ?? '');
    if (value.length < 4) {
      throw new Error('Password must be at least 4 characters');
    }
    if (value.length > 128) {
      throw new Error('Password must be 128 characters or fewer');
    }
    return value;
  }

  async signup(username, password) {
    const normalized = this.validateUsername(username);
    const validPassword = this.validatePassword(password);

    if (normalized === 'admin') {
      throw new Error(
        'Username "admin" is reserved. Use admin / admin to sign in on this device only, or pick another username.'
      );
    }

    const apiConfig = await loadApiConfig();

    if (apiConfig) {
      try {
        const remoteUser = await cloudSignup(apiConfig, normalized, validPassword);
        const user = await this.upsertLocalUser(remoteUser);
        await this.writeSession(user);

        let cloudSync = {
          status: 'synced',
          message: 'Account saved to the cloud. You can sign in on any device.',
        };
        if (accountCreatedHook) {
          cloudSync = await accountCreatedHook({ ensureUserIds: [user.id] });
        }

        return { session: this.session, cloudSync };
      } catch (error) {
        if (error.status === 409) {
          throw new Error(
            `${error.message} Sign in instead, or choose a different username.`
          );
        }
        if (!isNetworkError(error) && !error.offline) {
          throw error;
        }
      }
    }

    const existing = this.findUserByUsername(normalized);
    if (existing) {
      if (verifyPassword(validPassword, existing.passwordSalt, existing.passwordHash)) {
        await this.writeSession(existing);
        return { session: this.session, cloudSync: { status: 'existing' } };
      }

      throw new Error(
        `Username "${normalized}" is already registered. Sign in instead, or choose a different username.`
      );
    }

    const timestamp = nowIso();
    const { salt, hash } = hashPassword(validPassword);
    const user = {
      id: newId(),
      username: normalized,
      passwordSalt: salt,
      passwordHash: hash,
      role: 'staff',
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.data.users.push(user);
    try {
      await this.save({ skipSync: true });
      await this.writeSession(user);

      let cloudSync = {
        status: 'disabled',
        message: apiConfig
          ? 'Account saved locally while offline. It will upload when you are back online.'
          : 'Account saved locally. Add BACKEND_URL and SYNC_API_KEY to .env, then rebuild, for cloud sign-in.',
      };
      if (accountCreatedHook) {
        cloudSync = await accountCreatedHook({ ensureUserIds: [user.id] });
      }

      return { session: this.session, cloudSync };
    } catch (error) {
      this.data.users = this.data.users.filter((entry) => entry.id !== user.id);
      throw error;
    }
  }

  async login(username, password) {
    const normalized = this.validateUsername(username);
    const validPassword = this.validatePassword(password);
    const apiConfig = await loadApiConfig();

    if (apiConfig) {
      try {
        const remoteUser = await cloudLogin(apiConfig, normalized, validPassword);
        const user = await this.upsertLocalUser(remoteUser);
        await this.writeSession(user);
        return this.session;
      } catch (error) {
        if (error.status === 401) {
          throw new Error('Invalid username or password');
        }
        if (!isNetworkError(error) && !error.offline) {
          throw error;
        }
      }
    }

    const user = this.findUserByUsername(normalized);
    if (!user || !verifyPassword(validPassword, user.passwordSalt, user.passwordHash)) {
      if (apiConfig) {
        throw new Error(
          'Invalid username or password. If this is a new device, connect to the internet and try again.'
        );
      }
      throw new Error('Invalid username or password');
    }

    if (apiConfig && normalized !== 'admin') {
      try {
        const remoteUser = await cloudRegister(apiConfig, {
          id: user.id,
          username: normalized,
          password: validPassword,
        });
        const merged = await this.upsertLocalUser(remoteUser);
        await this.writeSession(merged);
        return this.session;
      } catch (registerError) {
        if (!isNetworkError(registerError) && !registerError.offline) {
          console.warn('Could not register local account to cloud:', registerError.message);
        }
      }
    }

    await this.writeSession(user);
    return this.session;
  }

  async logout() {
    await this.clearSession();
  }

  exportUsersForSync() {
    return this.data.users.map((user) => structuredClone(user));
  }

  applySyncMerge(incomingUsers = [], incomingDeletions = []) {
    let changed = false;

    for (const remote of incomingUsers) {
      if (!remote?.id || remote.deletedAt) {
        continue;
      }

      const localById = this.data.users.find((user) => user.id === remote.id);
      const localByName = this.data.users.find((user) => user.username === remote.username);
      const local = localById ?? localByName;

      if (!local) {
        this.data.users.push(structuredClone(remote));
        changed = true;
        continue;
      }

      if (new Date(remote.updatedAt).getTime() > new Date(local.updatedAt).getTime()) {
        Object.assign(local, structuredClone(remote));
        changed = true;
      }
    }

    this.dedupeUsersByUsername();

    for (const deletion of incomingDeletions) {
      const id = deletion?.id;
      const deletedAt = deletion?.deletedAt;
      if (!id || !deletedAt) {
        continue;
      }

      const index = this.data.users.findIndex((user) => user.id === id);
      if (index === -1) {
        continue;
      }

      const local = this.data.users[index];
      if (new Date(deletedAt).getTime() >= new Date(local.updatedAt).getTime()) {
        if (this.session?.id === id) {
          this.session = null;
        }
        this.data.users.splice(index, 1);
        changed = true;
      }
    }

    if (changed) {
      return this.save({ skipSync: true }).then(() => true);
    }

    return Promise.resolve(false);
  }
}

let authDb;
let persistHook = null;
let accountCreatedHook = null;
let loginHook = null;

function setAuthHooks({ onPersist, onAccountCreated, onLogin } = {}) {
  persistHook = onPersist ?? null;
  accountCreatedHook = onAccountCreated ?? null;
  loginHook = onLogin ?? null;
}

async function getAuth() {
  if (!authDb) {
    authDb = new UserDatabase();
    await authDb.init();
  }
  return authDb;
}

function registerAuthHandlers(ipcMain) {
  ipcMain.handle('auth:login', async (_event, { username, password }) => {
    const database = await getAuth();
    return database.login(username, password);
  });

  ipcMain.handle('auth:signup', async (_event, { username, password }) => {
    const database = await getAuth();
    return database.signup(username, password);
  });

  ipcMain.handle('auth:logout', async () => {
    const database = await getAuth();
    await database.logout();
  });

  ipcMain.handle('auth:get-session', async () => {
    const database = await getAuth();
    return database.getSession();
  });
}

module.exports = {
  getAuth,
  registerAuthHandlers,
  setAuthHooks,
  requireAuthSession: async () => {
    const database = await getAuth();
    return database.requireSession();
  },
};
