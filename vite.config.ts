import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error — plain .mjs export; works at runtime, no .d.ts needed
import { STAGING_DIR, REPO_ROOT } from './scripts/paths.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));

// Vite writes to the neutral staging dir. The dev orchestrator
// (`scripts/dev.mjs`) watches the staging dir and re-runs build-manifests
// to fan out to dist/{chrome,edge,firefox}/. In one-shot `npm run build`,
// the same fan-out runs as the next npm script. Vite itself doesn't know
// about per-browser variants — keeps the config simple and avoids the
// cross-process race of two `vite build --watch` runs both fan-out'ing
// the same dirs simultaneously.

export default defineConfig(({ mode }) => ({
  root: resolve(root, 'src'),
  publicDir: resolve(root, 'public'),
  build: {
    outDir: STAGING_DIR,
    // Wiping the staging dir on each build is correct for one-shot builds.
    // In dev/watch mode it would destroy the content.js that
    // vite.content.config.ts wrote on the previous pass — so skip the wipe.
    // `npm run build` runs `npm run clean` first to handle stale state.
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
    root: REPO_ROOT,
    include: ['src/**/*.test.ts'],
  },
}));
