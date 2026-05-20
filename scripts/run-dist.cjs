const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const publish = process.argv.includes('--publish');

require('./pre-dist-clean.cjs');

const lockedUnpacked = path.join(root, 'release', 'win-unpacked', 'resources', 'app.asar');
let outputDir = 'release';

if (fs.existsSync(lockedUnpacked)) {
  outputDir = 'release-build';
  console.warn(
    'release\\win-unpacked is still locked (close File Explorer there, quit Gym, then delete that folder).'
  );
  console.warn(`Building to ${outputDir}\\ instead.\n`);
}

const builderArgs = [
  'electron-builder',
  '--win',
  publish ? '--publish always' : '--publish never',
  `-c.directories.output=${outputDir}`,
].join(' ');

execSync(builderArgs, {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    CSC_IDENTITY_AUTO_DISCOVERY: 'false',
  },
});

if (outputDir !== 'release') {
  const setupGlob = fs.readdirSync(path.join(root, outputDir)).filter((name) => name.endsWith('.exe'));
  console.warn(`\nInstaller is in ${outputDir}\\ (${setupGlob.join(', ') || 'see folder'})`);
  console.warn('After reboot, delete the old locked release\\win-unpacked folder.');
}
