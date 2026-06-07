import { readFile, writeFile, cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const chromeDir = resolve(root, 'dist/chrome');

const base = JSON.parse(await readFile(resolve(root, 'manifest.base.json'), 'utf8'));

const variants = {
  chrome: (m) => m,
  edge: (m) => m,
  firefox: (m) => ({
    ...m,
    browser_specific_settings: {
      gecko: {
        id: 'ctm-importer@colorthemap.app',
        strict_min_version: '121.0',
      },
    },
  }),
  safari: (m) => m,
};

if (!existsSync(chromeDir)) {
  throw new Error(`Expected vite build output at ${chromeDir}. Run \`vite build\` first.`);
}

for (const [name, transform] of Object.entries(variants)) {
  const dir = resolve(root, 'dist', name);
  if (name !== 'chrome') {
    await rm(dir, { recursive: true, force: true });
    await cp(chromeDir, dir, { recursive: true });
  } else {
    await mkdir(dir, { recursive: true });
  }
  const manifest = transform(structuredClone(base));
  await writeFile(resolve(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`wrote ${name} manifest`);
}
