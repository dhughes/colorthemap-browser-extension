import { readFile, writeFile, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

// Single neutral staging dir that both Vite passes write into. No browser
// is privileged as "the canonical base" — each per-browser dist is built
// by copying from _build and applying that browser's manifest transform
// (and, in the future, its packaging step). This is the slot Safari (#5)
// can plug into without parallel infrastructure.
const stagingDir = resolve(root, 'dist/_build');

const base = JSON.parse(await readFile(resolve(root, 'manifest.base.json'), 'utf8'));

const variants = {
  chrome: { transform: (m) => m },
  edge: { transform: (m) => m },
  firefox: {
    transform: (m) => ({
      ...m,
      background: {
        scripts: ['background.js'],
        type: 'module',
      },
      browser_specific_settings: {
        gecko: {
          id: 'ctm-importer@colorthemap.app',
          strict_min_version: '121.0',
        },
      },
    }),
  },
};

if (!existsSync(stagingDir)) {
  throw new Error(`Expected vite build output at ${stagingDir}. Run \`vite build\` first.`);
}

// Filter out *.map sourcemaps and the public/ .gitkeep placeholder so each
// per-browser dist (and the eventual store-listing zip) doesn't ship them.
// Sourcemaps stay in dist/_build for local debugging.
const stripUnwanted = (src) => {
  if (src.endsWith('.map')) return false;
  if (src.endsWith('/.gitkeep')) return false;
  return true;
};

await Promise.all(
  Object.entries(variants).map(async ([name, { transform }]) => {
    const dir = resolve(root, 'dist', name);
    await rm(dir, { recursive: true, force: true });
    await cp(stagingDir, dir, { recursive: true, filter: stripUnwanted });
    const manifest = transform(structuredClone(base));
    await writeFile(resolve(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log(`wrote ${name} manifest`);
  }),
);
