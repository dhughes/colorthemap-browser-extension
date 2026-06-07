import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const safariSource = resolve(root, 'dist/safari');
const projectDir = resolve(root, 'dist/safari-xcode');

if (process.platform !== 'darwin') {
  console.log('safari converter: skipped (only runs on macOS)');
  process.exit(0);
}

if (!existsSync(safariSource)) {
  console.error('safari converter: dist/safari does not exist; run `npm run build` first');
  process.exit(1);
}

await rm(projectDir, { recursive: true, force: true });

const args = [
  'safari-web-extension-converter',
  safariSource,
  '--project-location', projectDir,
  '--bundle-identifier', 'app.colorthemap.importer',
  '--app-name', 'Color The Map Importer',
  '--swift',
  '--no-open',
  '--force',
];

await new Promise((resolvePromise, rejectPromise) => {
  const child = spawn('xcrun', args, { stdio: 'inherit' });
  child.on('error', (err) => {
    if (err.code === 'ENOENT') {
      rejectPromise(new Error('xcrun not found. Install Xcode (not just Command Line Tools).'));
    } else {
      rejectPromise(err);
    }
  });
  child.on('exit', (code) => {
    if (code === 0) resolvePromise();
    else rejectPromise(new Error(`xcrun safari-web-extension-converter exited with code ${code}`));
  });
});

console.log(`safari xcode project -> ${relative(root, projectDir)}`);
console.log('open it with: open dist/safari-xcode/Color\\ The\\ Map\\ Importer/Color\\ The\\ Map\\ Importer.xcodeproj');
console.log('then hit ⌘R in Xcode to register the extension with Safari.');
