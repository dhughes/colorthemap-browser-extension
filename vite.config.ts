import { defineConfig } from 'vite';
import webExtension, { readJsonFile } from 'vite-plugin-web-extension';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

// Single source of truth for the browser targets. Adding Safari (#5) is one
// entry here plus its manifest shape below.
const TARGETS = ['chrome', 'edge', 'firefox'] as const;
type Target = (typeof TARGETS)[number];

const isTarget = (value: string): value is Target => TARGETS.includes(value as Target);

const target = process.env.TARGET_BROWSER ?? 'chrome';
if (!isTarget(target)) {
  throw new Error(`Unknown TARGET_BROWSER "${target}". Expected one of: ${TARGETS.join(', ')}`);
}

// Per-browser manifest variants. The plugin resolves the manifest template
// before it extracts build inputs, so entry paths here point at source files
// (relative to the `src` root below) and the plugin rewrites them to built
// filenames.
//
// Firefox MV3 rejects `background.service_worker` — it wants `background.scripts`
// — and needs a `browser_specific_settings.gecko` block. Chrome and Edge share
// the base shape.
function generateManifest() {
  const base = readJsonFile(resolve(root, 'manifest.base.json'));
  if (target === 'firefox') {
    return {
      ...base,
      background: {
        scripts: ['background.ts'],
        type: 'module',
      },
      browser_specific_settings: {
        gecko: {
          id: 'ctm-importer@colorthemap.app',
          strict_min_version: '121.0',
        },
      },
    };
  }
  return base;
}

export default defineConfig({
  // Root at src/ so built entry files land at the top of dist/<browser>/
  // (background.js, popup.html, …) rather than nested under src/.
  root: resolve(root, 'src'),
  publicDir: resolve(root, 'public'),
  build: {
    outDir: resolve(root, `dist/${target}`),
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2022',
  },
  plugins: [
    webExtension({
      manifest: generateManifest,
      // web-ext only knows 'firefox' vs Chromium; Edge validates as Chromium.
      browser: target === 'firefox' ? 'firefox' : 'chrome',
      // We load the unpacked extension manually (see README), so don't let
      // web-ext spawn a browser in watch/dev mode.
      disableAutoLaunch: true,
      // Rebuild when the manifest source changes, not just src/ entries.
      watchFilePaths: [resolve(root, 'manifest.base.json')],
    }),
  ],
});
