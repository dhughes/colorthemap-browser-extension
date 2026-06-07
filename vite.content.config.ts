import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

// Content scripts run as classic scripts in MV3 — no ESM imports allowed.
// Build content.ts separately as a single IIFE bundle so any shared modules
// get inlined into one file.
export default defineConfig({
  build: {
    outDir: resolve(root, 'dist/chrome'),
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
