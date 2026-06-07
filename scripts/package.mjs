import { mkdir, rm, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const artifactsDir = resolve(root, 'artifacts');

await mkdir(artifactsDir, { recursive: true });

const browsers = ['chrome', 'edge', 'firefox'];

for (const browser of browsers) {
  const sourceDir = resolve(root, 'dist', browser);
  const outPath = resolve(artifactsDir, `${browser}.zip`);
  await rm(outPath, { force: true });
  await zipDirectory(sourceDir, outPath);
  console.log(`packaged ${browser} -> ${relative(root, outPath)}`);
}


async function zipDirectory(sourceDir, outPath) {
  await stat(sourceDir);
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('zip', ['-r', '-q', outPath, '.'], { cwd: sourceDir, stdio: 'inherit' });
    child.on('error', rejectPromise);
    child.on('exit', (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`zip exited with code ${code}`));
    });
  });
}
