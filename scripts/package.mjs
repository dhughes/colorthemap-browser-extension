import { mkdir, rm, stat } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const artifactsDir = resolve(root, 'artifacts');

// Fail fast if `zip` isn't installed — otherwise the first ENOENT happens
// mid-loop after `rm` has already deleted the previous artifact, leaving
// artifacts/ in a half-written state. This bites Alpine / slim Docker
// images where zip isn't part of the base install.
const zipCheck = spawnSync('zip', ['--version'], { stdio: 'ignore' });
if (zipCheck.error?.code === 'ENOENT') {
  console.error('ERROR: `zip` is not installed. Install with `brew install zip` (macOS) or `apt-get install zip` (Debian/Ubuntu/Alpine via apk add zip).');
  process.exit(1);
}

await mkdir(artifactsDir, { recursive: true });

const browsers = ['chrome', 'edge', 'firefox'];

await Promise.all(browsers.map(async (browser) => {
  const sourceDir = resolve(root, 'dist', browser);
  const outPath = resolve(artifactsDir, `${browser}.zip`);
  await rm(outPath, { force: true });
  await zipDirectory(sourceDir, outPath);
  console.log(`packaged ${browser} -> ${relative(root, outPath)}`);
}));

async function zipDirectory(sourceDir, outPath) {
  await stat(sourceDir);
  await new Promise((resolvePromise, rejectPromise) => {
    // Exclude sourcemaps and the public/ tracked placeholder from the
    // submission artifacts — they're useful in dist/ for local debug but
    // have no place in store-listing zips (AMO review flags shipped maps).
    const args = ['-r', '-q', outPath, '.', '-x', '*.map', '-x', '.gitkeep'];
    const child = spawn('zip', args, { cwd: sourceDir, stdio: 'inherit' });
    child.on('error', rejectPromise);
    child.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`zip exited with code ${code}`));
    });
  });
}
