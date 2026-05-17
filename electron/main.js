const { app, BrowserWindow, nativeImage } = require('electron');
const path = require('path');

const isDev = process.env.NODE_ENV === 'development';

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
  const win = new BrowserWindow({
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
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.gym.desktop');
  }

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
