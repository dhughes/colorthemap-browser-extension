import { readFile, writeFile, cp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT, STAGING_DIR, DIST_DIR } from './paths.mjs';

// Single source of truth for browser variants. Adding Safari (#5) is one
// entry here; the per-browser keys flow out to package.mjs's zip loop and
// anywhere else that needs to iterate the list, so they can't drift.
//
// Frozen so a consumer can't accidentally mutate the shared map — both the
// top-level object and each entry, since each entry holds the transform fn
// callers actually invoke.
export const variants = Object.freeze({
  chrome: Object.freeze({ transform: (m) => m }),
  edge: Object.freeze({ transform: (m) => m }),
  firefox: Object.freeze({
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
  }),
});

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
// Stable under the common path-style differences argv[1] can have vs
// import.meta.url (relative vs absolute, OS-specific separators):
// pathToFileURL absolutizes argv[1] against cwd and url-encodes consistently
// with how Node already encodes import.meta.url. Note: pathToFileURL is
// lexical — it does NOT resolve symlinks. If anyone ever wires this script
// through a node_modules/.bin symlink, the two URLs would diverge and the
// guard would silently skip; today's only invocation is
// `node scripts/build-manifests.mjs` from the repo root, where they agree.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildManifests();
}
