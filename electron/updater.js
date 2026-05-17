const { autoUpdater } = require('electron-updater');

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

function sendStatus(mainWindow, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('update:status', payload);
}

function setupAutoUpdater(mainWindow) {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.disableDifferentialDownload = false;

  autoUpdater.on('checking-for-update', () => {
    sendStatus(mainWindow, { status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    sendStatus(mainWindow, {
      status: 'available',
      version: info.version,
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    sendStatus(mainWindow, {
      status: 'not-available',
      version: info.version,
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    sendStatus(mainWindow, {
      status: 'downloading',
      percent: progress.percent,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    sendStatus(mainWindow, {
      status: 'downloaded',
      version: info.version,
    });
  });

  autoUpdater.on('error', (error) => {
    sendStatus(mainWindow, {
      status: 'error',
      message: error?.message ?? 'Update check failed',
    });
  });

  function checkForUpdates() {
    return autoUpdater.checkForUpdates();
  }

  checkForUpdates().catch(() => {});

  const intervalId = setInterval(() => {
    checkForUpdates().catch(() => {});
  }, CHECK_INTERVAL_MS);

  return {
    checkForUpdates,
    downloadUpdate: () => autoUpdater.downloadUpdate(),
    quitAndInstall: () => {
      autoUpdater.quitAndInstall(false, true);
    },
    dispose: () => clearInterval(intervalId),
  };
}

module.exports = { setupAutoUpdater };
