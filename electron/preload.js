const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gymApp', {
  platform: process.platform,
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('update:status', listener);
    return () => ipcRenderer.removeListener('update:status', listener);
  },
  getSyncStatus: () => ipcRenderer.invoke('sync:get-status'),
  runSync: () => ipcRenderer.invoke('sync:run', { force: true }),
  getSyncConfig: () => ipcRenderer.invoke('sync:get-config'),
  onSyncStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('sync:status', listener);
    return () => ipcRenderer.removeListener('sync:status', listener);
  },
  auth: {
    login: (username, password) => ipcRenderer.invoke('auth:login', { username, password }),
    signup: (username, password) => ipcRenderer.invoke('auth:signup', { username, password }),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getSession: () => ipcRenderer.invoke('auth:get-session'),
  },
  categories: {
    list: () => ipcRenderer.invoke('db:categories:list'),
    create: (payload) => ipcRenderer.invoke('db:categories:create', payload),
    delete: (id) => ipcRenderer.invoke('db:categories:delete', { id }),
  },
  products: {
    list: (options) => ipcRenderer.invoke('db:products:list', options ?? {}),
    create: (payload) => ipcRenderer.invoke('db:products:create', payload),
    update: (id, payload) => ipcRenderer.invoke('db:products:update', { id, ...payload }),
    delete: (id) => ipcRenderer.invoke('db:products:delete', { id }),
  },
  pos: {
    completeSale: (payload) => ipcRenderer.invoke('db:pos:complete-sale', payload),
  },
  packages: {
    list: (options) => ipcRenderer.invoke('db:packages:list', options ?? {}),
    create: (payload) => ipcRenderer.invoke('db:packages:create', payload),
    update: (id, payload) => ipcRenderer.invoke('db:packages:update', { id, ...payload }),
    delete: (id) => ipcRenderer.invoke('db:packages:delete', { id }),
  },
  fees: {
    collectRenew: (studentId, payload) =>
      ipcRenderer.invoke('db:fees:collect-renew', { studentId, ...payload }),
  },
  students: {
    list: () => ipcRenderer.invoke('db:students:list'),
    create: (payload) => ipcRenderer.invoke('db:students:create', payload),
    update: (id, payload) => ipcRenderer.invoke('db:students:update', { id, ...payload }),
    delete: (id) => ipcRenderer.invoke('db:students:delete', { id }),
    checkIn: (studentId, method) =>
      ipcRenderer.invoke('db:attendance:check-in', { studentId, method }),
    checkInByFingerprint: (credentialId) =>
      ipcRenderer.invoke('db:attendance:check-in-fingerprint', { credentialId }),
    registerFingerprint: (studentId, credentialId, userHandle) =>
      ipcRenderer.invoke('db:fingerprint:register', { studentId, credentialId, userHandle }),
    clearFingerprint: (studentId) =>
      ipcRenderer.invoke('db:fingerprint:clear', { studentId }),
    deleteAttendance: (studentId, attendanceId) =>
      ipcRenderer.invoke('db:attendance:delete', { studentId, attendanceId }),
    setPin: (studentId, pin) => ipcRenderer.invoke('db:pin:set', { studentId, pin }),
    clearPin: (studentId) => ipcRenderer.invoke('db:pin:clear', { studentId }),
    checkInByMemberCode: (memberCode) =>
      ipcRenderer.invoke('db:attendance:check-in-member-code', { memberCode }),
    checkInByPin: (pin) => ipcRenderer.invoke('db:attendance:check-in-pin', { pin }),
  },
});
