import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = fileURLToPath(new URL('.', import.meta.url));

// Neutral staging output that downstream variants (chrome / edge / firefox /
// future safari) copy from. Keep this in sync with scripts/build-manifests.mjs
// and vite.content.config.ts — there is one shared constant by convention but
// not by import, because vite reads its config in a separate JS evaluation
// where importing build-time helpers adds churn we don't need yet.
const stagingDir = resolve(root, 'dist/_build');

// In dev/watch mode, re-fan-out the per-browser dist dirs after every Vite
// rebuild. Without this, editing popup.ts updates dist/_build/popup.js but
// dist/chrome/popup.js stays stale, and the user's loaded-unpacked extension
// keeps running the old code.
//
// In production builds we DON'T attach this plugin — the npm `build` script
// invokes build-manifests.mjs as an explicit later step, so running it twice
// would just duplicate work.
const fanOutManifests = () => ({
  name: 'ctm-fan-out-manifests',
  apply: 'build' as const,
  async closeBundle() {
    await new Promise<void>((resolvePromise, rejectPromise) => {
      const child = spawn('node', [resolve(root, 'scripts/build-manifests.mjs')], {
        stdio: 'inherit',
        cwd: root,
      });
      child.on('error', rejectPromise);
      child.on('exit', (code) => {
        if (code === 0) resolvePromise();
        else rejectPromise(new Error(`build-manifests exited with code ${code}`));
      });
    });
  },
});

export default defineConfig(({ mode }) => ({
  root: resolve(root, 'src'),
  publicDir: resolve(root, 'public'),
  plugins: mode === 'development' ? [fanOutManifests()] : [],
  build: {
    outDir: stagingDir,
    // Wiping the staging dir on each build is correct for one-shot builds.
    // In dev/watch mode it would destroy the content.js + manifest.json that
    // vite.content.config.ts and build-manifests.mjs wrote on the previous
    // pass, leaving the unpacked extension unloadable until a full rebuild —
    // so we skip the wipe in dev. `npm run dev` cleans dist/ explicitly first.
    emptyOutDir: mode !== 'development',
    sourcemap: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        background: resolve(root, 'src/background.ts'),
        popup: resolve(root, 'src/popup.html'),
        options: resolve(root, 'src/options.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
  test: {
    environment: 'node',
    root: root,
    include: ['src/**/*.test.ts'],
  },
}));
