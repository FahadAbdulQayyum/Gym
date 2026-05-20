const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const publish = process.argv.includes('--publish');

require('./pre-dist-clean.cjs');

function isDirLocked(outputDir) {
  const asarPath = path.join(root, outputDir, 'win-unpacked', 'resources', 'app.asar');
  return fs.existsSync(asarPath);
}

const candidates = ['release', 'release-build', 'release-new'];
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
candidates.push(`release-${stamp}`);

let outputDir = candidates.find((dir) => !isDirLocked(dir));
if (!outputDir) {
  outputDir = candidates[candidates.length - 1];
  console.warn(`All output folders locked — using fresh folder ${outputDir}\\`);
}

if (outputDir !== 'release') {
  console.warn(`Building installer to ${outputDir}\\\n`);
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

const setupFiles = fs
  .readdirSync(path.join(root, outputDir))
  .filter((name) => name.endsWith('.exe') && name.includes('Setup'));

console.log(`\nInstaller ready: ${path.join(outputDir, setupFiles[0] || '(see .exe in folder)')}`);

if (outputDir !== 'release') {
  console.warn(
    'Close Gym / File Explorer on old release folders, then delete locked release\\ or release-build\\ if you want a clean release\\ path next time.'
  );
}
