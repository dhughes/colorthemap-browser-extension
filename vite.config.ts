import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: resolve(root, 'src'),
  publicDir: resolve(root, 'public'),
  build: {
    outDir: resolve(root, 'dist/chrome'),
    emptyOutDir: true,
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
});
