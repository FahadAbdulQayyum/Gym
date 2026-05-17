const { app, BrowserWindow, ipcMain, nativeImage } = require('electron');
const path = require('path');
const { setupAutoUpdater } = require('./updater');

const isDev = process.env.NODE_ENV === 'development';

let mainWindow;
let updater;

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
      : path.join(assetsDir, 'icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  return icon.isEmpty() ? undefined : icon;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 640,
    minWidth: 720,
    minHeight: 520,
    title: 'Gym',
    icon: loadAppIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.webContents.on('did-finish-load', () => {
    if (app.isPackaged && !updater) {
      updater = setupAutoUpdater(mainWindow);
    }
  });
}

function registerIpcHandlers() {
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

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.gym.desktop');
  }

  registerIpcHandlers();
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
});
