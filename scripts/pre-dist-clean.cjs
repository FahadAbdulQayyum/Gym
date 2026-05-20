const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');

function stopLockingProcesses() {
  if (process.platform !== 'win32') {
    return;
  }

  for (const name of ['Gym', 'electron', 'app-builder']) {
    try {
      execSync(`taskkill /F /IM ${name}.exe /T 2>nul`, { stdio: 'ignore' });
      console.log(`Stopped ${name}.exe (if it was running)`);
    } catch {
      // not running
    }
  }
}

function removeDir(dir) {
  if (!fs.existsSync(dir)) {
    return true;
  }

  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 8, retryDelay: 500 });
    console.log(`Removed ${path.relative(root, dir)}`);
    return true;
  } catch (error) {
    console.warn(`Could not remove ${path.relative(root, dir)}:`, error.message);
    return false;
  }
}

stopLockingProcesses();

for (const name of ['release', 'release-build', 'release-new']) {
  removeDir(path.join(root, name, 'win-unpacked'));
}
