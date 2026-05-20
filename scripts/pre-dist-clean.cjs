const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const winUnpacked = path.join(root, 'release', 'win-unpacked');

function stopLockingProcesses() {
  if (process.platform !== 'win32') {
    return;
  }

  for (const name of ['Gym', 'electron']) {
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
    return;
  }

  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 });
  console.log(`Removed ${path.relative(root, dir)}`);
}

stopLockingProcesses();
try {
  removeDir(winUnpacked);
} catch (error) {
  console.warn('Could not remove release\\win-unpacked:', error.message);
  console.warn('Will try an alternate output folder if needed.\n');
}
