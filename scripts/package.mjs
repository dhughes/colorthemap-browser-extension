import { mkdir, rm, stat } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import { resolve, relative } from 'node:path';
import { ARTIFACTS_DIR, DIST_DIR, REPO_ROOT } from './paths.mjs';
import { variants } from './build-manifests.mjs';

const browsers = Object.keys(variants);

// Fail fast if `zip` isn't installed — otherwise the first ENOENT happens
// mid-loop after `rm` has already deleted the previous artifact, leaving
// artifacts/ in a half-written state. This bites Alpine / slim Docker
// images where zip isn't part of the base install.
const zipCheck = spawnSync('zip', ['--version'], { stdio: 'ignore' });
if (zipCheck.error?.code === 'ENOENT') {
  console.error('ERROR: `zip` is not installed. Install with `brew install zip` (macOS) or `apt-get install zip` (Debian/Ubuntu).');
  process.exit(1);
}

await mkdir(ARTIFACTS_DIR, { recursive: true });

// Sequential: the three zips read from the same filesystem and write to the
// same artifacts dir. Concurrent runs would contend for the disk queue and
// triple peak RSS for marginal wall-time benefit. Keep it linear.
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
    // Exclude sourcemaps and `.gitkeep` placeholders at any depth from the
    // submission artifacts. The cp filter in build-manifests already does
    // this; this is defense-in-depth in case dist/ was hand-populated.
    // `*/.gitkeep` matches at any depth; `.gitkeep` matches at archive root.
    const args = ['-r', '-q', outPath, '.', '-x', '*.map', '-x', '.gitkeep', '-x', '*/.gitkeep'];
    // stdin must be 'ignore', not 'inherit'. Otherwise zip inherits the
    // parent's stdin and on the second iteration (when `npm run package` has
    // already drained/closed npm's stdin pipe) zip falls back to reading
    // input filenames from stdin, sees EOF immediately, and exits 12 with
    // "Nothing to do!" — even though `.` is right there on argv.
    const child = spawn('zip', args, { cwd: sourceDir, stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('error', rejectPromise);
    child.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`zip exited with code ${code}`));
    });
  });
}
