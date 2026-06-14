// Single source of truth for build-pipeline paths.
//
// Imported by vite.config.ts, vite.content.config.ts, scripts/build-manifests.mjs,
// and scripts/package.mjs. Renaming a path here updates every consumer.

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Neutral staging dir that both Vite passes write into. Per-browser variants
// (chrome / edge / firefox / future safari) copy from here.
export const STAGING_DIR = resolve(REPO_ROOT, 'dist/_build');

// Per-browser deliverable dirs that get loaded-unpacked / zipped for stores.
export const DIST_DIR = resolve(REPO_ROOT, 'dist');
export const ARTIFACTS_DIR = resolve(REPO_ROOT, 'artifacts');

export const BROWSERS = ['chrome', 'edge', 'firefox'];
