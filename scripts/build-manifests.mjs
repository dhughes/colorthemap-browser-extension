import { readFile, writeFile, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT, STAGING_DIR, DIST_DIR } from './paths.mjs';

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

// Filter out *.map sourcemaps and `.gitkeep` placeholders so each per-browser
// dist (and the eventual store-listing zip) doesn't ship them. Sourcemaps
// stay in dist/_build for local debugging. Checks the tail path component
// (rather than `.endsWith('/.gitkeep')`) so it works on Windows too.
const stripUnwanted = (src) => {
  if (src.endsWith('.map')) return false;
  const tail = src.split(sep).pop();
  if (tail === '.gitkeep') return false;
  return true;
};

export async function buildManifests() {
  if (!existsSync(STAGING_DIR)) {
    throw new Error(`Expected vite build output at ${STAGING_DIR}. Run \`vite build\` first.`);
  }

  const base = JSON.parse(await readFile(resolve(REPO_ROOT, 'manifest.base.json'), 'utf8'));

  await Promise.all(
    Object.entries(variants).map(async ([name, { transform }]) => {
      const dir = resolve(DIST_DIR, name);
      await rm(dir, { recursive: true, force: true });
      await cp(STAGING_DIR, dir, { recursive: true, filter: stripUnwanted });
      const manifest = transform(structuredClone(base));
      await writeFile(resolve(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
      console.log(`wrote ${name} manifest`);
    }),
  );
}

// Run when invoked as a script (npm run build), not when imported.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await buildManifests();
}
