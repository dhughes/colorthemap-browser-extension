import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STAGING_DIR } from './scripts/paths.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));

// Content scripts run as classic scripts in MV3 — no ESM imports allowed.
// Build content.ts separately as a single IIFE bundle so any shared modules
// get inlined into one file.
export default defineConfig({
  build: {
    // Writes into the same neutral staging dir as vite.config.ts so the
    // content script gets layered on top of the main build's output.
    outDir: STAGING_DIR,
    emptyOutDir: false,
    sourcemap: true,
    target: 'es2022',
    lib: {
      entry: resolve(root, 'src/content.ts'),
      name: 'CtmContent',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
  },
});
