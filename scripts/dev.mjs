// Dev orchestrator. Runs the main + content Vite watchers concurrently AND
// owns the fan-out into per-browser dist dirs. Owning the fan-out here (rather
// than as a vite plugin in each config) gives us a single mutex per process
// and avoids cross-process races between the two `vite build --watch` runs
// that would otherwise both rm -rf + cp the same dist/{chrome,edge,firefox}
// directories simultaneously.

import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { existsSync } from 'node:fs';
import { REPO_ROOT, STAGING_DIR } from './paths.mjs';
import { buildManifests } from './build-manifests.mjs';

// package.json's `engines` field is advisory by default — npm only warns,
// it doesn't block install, and bare `node scripts/dev.mjs` ignores it.
// Re-check at the use site so a too-old runtime fails loudly here instead
// of silently producing a no-op `fs.watch({recursive: true})` (unsupported
// on Linux until Node 20).
const [nodeMajor] = process.versions.node.split('.').map(Number);
if (nodeMajor < 20) {
  console.error(`ERROR: Node ${process.versions.node} detected. scripts/dev.mjs requires Node 20+ for fs.watch({recursive: true}).`);
  process.exit(1);
}

if (!existsSync(STAGING_DIR)) {
  console.error(`ERROR: ${STAGING_DIR} does not exist. Run \`npm run build\` first (the \`dev\` npm script handles this for you).`);
  process.exit(1);
}

const watchers = [
  {
    label: 'main',
    args: ['build', '--watch', '--mode', 'development'],
  },
  {
    label: 'content',
    args: ['build', '--watch', '--mode', 'development', '--config', 'vite.content.config.ts'],
  },
];

const children = [];
let shuttingDown = false;
let firstFailureCode = null;
let stagingWatcher = null;

const shutdown = (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      try {
        child.kill(signal);
      } catch {
        // ESRCH if the child already died — fine.
      }
    }
  }
  // Close the FSWatcher too. Without this, the active fs.watch keeps the
  // event loop alive after the children exit and the process hangs forever,
  // ignoring process.exitCode entirely. Setting null lets a late event
  // handler skip a closed watcher cleanly.
  if (stagingWatcher) {
    try { stagingWatcher.close(); } catch {}
    stagingWatcher = null;
  }
};

process.on('SIGINT', () => { shutdown('SIGINT'); });
process.on('SIGTERM', () => { shutdown('SIGTERM'); });

for (const { label, args } of watchers) {
  // Spawn the vite binary directly. `npm run dev` puts node_modules/.bin on
  // PATH, so vite resolves without needing an npx hop. Saves a node startup
  // per watcher and keeps signal forwarding (SIGTERM) simple.
  const child = spawn('vite', args, {
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
  child.on('error', (err) => {
    console.error(`${prefix}failed to spawn vite:`, err.message);
    if (firstFailureCode === null) firstFailureCode = 127;
    process.exitCode = firstFailureCode;
    shutdown('SIGTERM');
  });
  child.on('exit', (code) => {
    console.error(`${prefix}exited with code ${code}`);
    // Preserve the FIRST non-zero exit so a cascading SIGTERM-induced exit
    // doesn't overwrite the real crash code from whichever watcher actually
    // failed.
    if (code !== 0 && firstFailureCode === null) {
      firstFailureCode = code ?? 1;
    }
    if (firstFailureCode !== null) {
      process.exitCode = firstFailureCode;
    }
    shutdown('SIGTERM');
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
  // Coalesce bursts of writes into one fan-out. 250ms is large enough that a
  // slow disk's gap between Vite's `popup.js` and `popup.js.map` writes
  // doesn't trip the timer mid-emit (which would copy a partial staging dir
  // into the per-browser dists), but small enough that an interactive edit
  // → reload loop feels instant.
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void runFanOut();
  }, 250);
};

stagingWatcher = watch(STAGING_DIR, { recursive: true }, (_eventType, filename) => {
  if (!filename) return;
  // Ignore sourcemap-only writes — they're filtered out of the per-browser
  // dists anyway, so re-running fan-out for them would just re-copy the
  // already-correct output. Real .js / .html / .json changes still trigger.
  if (filename.endsWith('.map')) return;
  scheduleFanOut();
});

console.log('[dev] watching staging dir for fan-out');
