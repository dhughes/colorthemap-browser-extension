// Dev orchestrator. Runs the main + content Vite watchers concurrently AND
// owns the fan-out into per-browser dist dirs. Owning the fan-out here (rather
// than as a vite plugin in each config) gives us a single mutex per process
// and avoids cross-process races between the two `vite build --watch` runs
// that would otherwise both rm -rf + cp the same dist/{chrome,edge,firefox}
// directories simultaneously.

import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { REPO_ROOT, STAGING_DIR } from './paths.mjs';
import { buildManifests } from './build-manifests.mjs';

const watchers = [
  {
    label: 'main',
    args: ['vite', 'build', '--watch', '--mode', 'development'],
  },
  {
    label: 'content',
    args: ['vite', 'build', '--watch', '--mode', 'development', '--config', 'vite.content.config.ts'],
  },
];

const children = [];

const shutdown = (signal) => {
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
};

process.on('SIGINT', () => { shutdown('SIGINT'); });
process.on('SIGTERM', () => { shutdown('SIGTERM'); });

for (const { label, args } of watchers) {
  const child = spawn('npx', args, {
    cwd: REPO_ROOT,
    stdio: ['inherit', 'pipe', 'pipe'],
  });
  children.push(child);
  const prefix = `[${label}] `;
  const tag = (chunk) => chunk.toString().split('\n').map((line, i, lines) => {
    if (i === lines.length - 1 && line === '') return '';
    return prefix + line;
  }).join('\n');
  child.stdout.on('data', (chunk) => process.stdout.write(tag(chunk)));
  child.stderr.on('data', (chunk) => process.stderr.write(tag(chunk)));
  child.on('exit', (code) => {
    console.error(`${prefix}exited with code ${code}`);
    shutdown('SIGTERM');
    process.exitCode = code ?? 1;
  });
}

// Watch dist/_build for any change either Vite watcher writes, then re-run
// the fan-out. Single-flight mutex with a "pending" follow-up so rapid bursts
// of writes still end with one fan-out reflecting the latest staging state.
let running = null;
let pending = false;
let debounceTimer = null;

const runFanOut = async () => {
  if (running) {
    pending = true;
    return;
  }
  do {
    pending = false;
    running = buildManifests().catch((err) => {
      console.error('[fan-out]', err);
    });
    await running;
    running = null;
  } while (pending);
};

const scheduleFanOut = () => {
  // Coalesce bursts (multiple files written in one rebuild) into one fan-out.
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void runFanOut();
  }, 100);
};

watch(STAGING_DIR, { recursive: true }, (_eventType, filename) => {
  if (!filename) return;
  scheduleFanOut();
});

console.log('[dev] watching staging dir for fan-out');
