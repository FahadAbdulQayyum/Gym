const { app, BrowserWindow, ipcMain, nativeImage } = require('electron');
const path = require('path');
const { setupAutoUpdater } = require('./updater');
const { registerDatabaseHandlers, getDatabase, setDatabaseHooks } = require('./database');
const { registerAuthHandlers, getAuth, setAuthHooks } = require('./auth');
const {
  setupSync,
  disposeSync,
  scheduleSync,
  recordDeletion,
  registerSyncHandlers,
  runSync,
} = require('./sync');
const { createStaticServer } = require('./static-server');

const isDev = process.env.NODE_ENV === 'development';

let mainWindow;
let updater;
let staticServer;

function getAssetsDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar', 'assets');
  }
  return path.join(__dirname, '..', 'assets');
}

function loadAppIcon() {
  const assetsDir = getAssetsDir();
  const iconPath =
    process.platform === 'win32'
      ? path.join(assetsDir, 'icon.ico')
      : path.join(assetsDir, 'dumble.png');
  const icon = nativeImage.createFromPath(iconPath);
  return icon.isEmpty() ? undefined : icon;
}

async function loadMainWindow() {
  if (isDev) {
    await mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    return;
  }

  const distDir = path.join(__dirname, '..', 'dist');
  staticServer = await createStaticServer(distDir);
  await mainWindow.loadURL(staticServer.url);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    title: 'Gym',
    icon: loadAppIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  loadMainWindow().catch((error) => {
    console.error('Failed to load app window:', error);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (app.isPackaged && !updater) {
      updater = setupAutoUpdater(mainWindow);
    }
  });
}

function broadcastSyncStatus(status) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('sync:status', status);
  }
}

function registerIpcHandlers() {
  registerAuthHandlers(ipcMain);
  registerDatabaseHandlers(ipcMain);
  registerSyncHandlers(ipcMain);

  ipcMain.handle('app:get-version', () => app.getVersion());

  ipcMain.handle('update:check', () => {
    if (!updater) return null;
    return updater.checkForUpdates();
  });

  ipcMain.handle('update:download', () => {
    if (!updater) return null;
    return updater.downloadUpdate();
  });

  ipcMain.handle('update:install', () => {
    if (!updater) return;
    updater.quitAndInstall();
  });
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.gym.desktop');
  }

  registerIpcHandlers();

  const auth = await getAuth();
  const database = await getDatabase();
  await database.migrateOrphanStudents(auth.data.users);

  setDatabaseHooks({
    onPersist: scheduleSync,
    onDelete: recordDeletion,
  });

  setAuthHooks({
    onPersist: scheduleSync,
    onAccountCreated: (options) => runSync(options),
  });

  setupSync({
    getDatabase,
    getAuth,
    onStatus: broadcastSyncStatus,
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  updater?.dispose();
  disposeSync();
  if (staticServer?.server) {
    staticServer.server.close();
  }
});
