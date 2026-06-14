import { mkdir, rm, stat } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { resolve, relative } from 'node:path';
import { ARTIFACTS_DIR, DIST_DIR, REPO_ROOT } from './paths.mjs';
import { variants } from './build-manifests.mjs';

// KNOWN ISSUE: `npm run package` (which chains `npm run build && node
// scripts/package.mjs`) intermittently fails with `zip ... Nothing to do!`
// on macOS + Node 24 + the npm version we have pinned. The failure mode
// only reproduces when zip is launched from inside the npm-shell chain;
// running `node scripts/package.mjs` directly (after `npm run build`)
// always succeeds. Workaround until the build pipeline migrates to a
// proper WebExtension Vite plugin:
//
//   npm run build && node scripts/package.mjs
//
// Tracking issue for the migration: #11. This whole script gets deleted
// by that migration.

const browsers = Object.keys(variants);

const zipCheck = spawnSync('zip', ['--version'], { stdio: 'ignore' });
if (zipCheck.error?.code === 'ENOENT') {
  console.error('ERROR: `zip` is not installed. Install with `brew install zip` (macOS) or `apt-get install zip` (Debian/Ubuntu).');
  process.exit(1);
}

await mkdir(ARTIFACTS_DIR, { recursive: true });

for (const browser of browsers) {
  const sourceDir = resolve(DIST_DIR, browser);
  const outPath = resolve(ARTIFACTS_DIR, `${browser}.zip`);
  await rm(outPath, { force: true });
  await zipDirectory(sourceDir, outPath);
  console.log(`packaged ${browser} -> ${relative(REPO_ROOT, outPath)}`);
}

async function zipDirectory(sourceDir, outPath) {
  await stat(sourceDir);
  await new Promise((resolvePromise, rejectPromise) => {
    const args = ['-r', '-q', outPath, '.', '-x', '*.map', '-x', '.gitkeep', '-x', '*/.gitkeep'];
    const child = spawn('zip', args, { cwd: sourceDir, stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('error', rejectPromise);
    child.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`zip exited with code ${code} for ${outPath}`));
    });
  });
}
