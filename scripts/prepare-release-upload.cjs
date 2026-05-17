const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const releaseDir = path.join(root, 'release');
const uploadDir = path.join(root, 'release-upload');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const latestYmlPath = path.join(releaseDir, 'latest.yml');
if (!fs.existsSync(latestYmlPath)) {
  console.error('Missing release/latest.yml — run "npm run dist" first.');
  process.exit(1);
}

const latestYml = fs.readFileSync(latestYmlPath, 'utf8');
const versionMatch = latestYml.match(/^version:\s*(.+)$/m);
const pathMatch = latestYml.match(/^path:\s*(.+)$/m);

if (!versionMatch || !pathMatch) {
  console.error('Could not parse release/latest.yml');
  process.exit(1);
}

const version = versionMatch[1].trim();
const setupName = pathMatch[1].trim();

if (version !== pkg.version) {
  console.warn(
    `Warning: package.json is ${pkg.version} but latest.yml is ${version}. Re-run "npm run dist".`
  );
}

const setupWithSpaces = `Gym Setup ${version}.exe`;
const blockmapWithSpaces = `${setupWithSpaces}.blockmap`;
const setupHyphenated = setupName;
const blockmapHyphenated = `${setupName}.blockmap`;

const sourceSetup = path.join(releaseDir, setupWithSpaces);
const sourceBlockmap = path.join(releaseDir, blockmapWithSpaces);

if (!fs.existsSync(sourceSetup)) {
  console.error(`Missing ${sourceSetup} — run "npm run dist" first.`);
  process.exit(1);
}

if (!fs.existsSync(sourceBlockmap)) {
  console.error(`Missing ${sourceBlockmap} — run "npm run dist" first.`);
  process.exit(1);
}

fs.rmSync(uploadDir, { recursive: true, force: true });
fs.mkdirSync(uploadDir, { recursive: true });

fs.copyFileSync(latestYmlPath, path.join(uploadDir, 'latest.yml'));
fs.copyFileSync(sourceSetup, path.join(uploadDir, setupHyphenated));
fs.copyFileSync(sourceBlockmap, path.join(uploadDir, blockmapHyphenated));

console.log(`Prepared release-upload for v${version}:`);
for (const name of fs.readdirSync(uploadDir)) {
  const stat = fs.statSync(path.join(uploadDir, name));
  console.log(`  ${name} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
}
