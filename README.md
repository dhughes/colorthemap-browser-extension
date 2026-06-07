# colorthemap-browser-extension

Cross-browser WebExtension that detects GPS file downloads (GPX/FIT/TCX/KML/KMZ) on any site and offers to import them into [Color The Map](https://github.com/dhughes/color-the-map).

Phase 1 plan: [issue #1](https://github.com/dhughes/colorthemap-browser-extension/issues/1).

## Status

This branch is the **project scaffold only** — Manifest V3 shell, build pipeline, and a marker that proves each surface loads. No detection, auth, or upload yet; those land in follow-up issues.

## Stack

- TypeScript + Vite (multi-entry build)
- Vitest for unit tests
- `webextension-polyfill` so the same source builds against Chrome, Edge, Firefox, and Safari
- Single `manifest.base.json`; `scripts/build-manifests.mjs` fans it out into per-browser `dist/` folders

## Layout

```
src/
  background.ts     # MV3 service worker (module)
  content.ts        # content script injected on <all_urls>
  popup.html        # browser action popup
  popup.ts
  options.html      # options page (open_in_tab)
  options.ts
  shared/
    alive.ts        # the "I am loaded" marker each surface logs
    alive.test.ts   # sample Vitest test
manifest.base.json  # source of truth, transformed per-browser at build time
scripts/
  build-manifests.mjs
  package.mjs       # zips chrome/edge/firefox into artifacts/
public/             # static assets copied as-is into each dist (icons go here)
```

## Dev

```sh
npm install
npm run build       # vite build + write per-browser manifests under dist/
npm test            # vitest
npm run dev         # vite build --watch
npm run package     # build + zip artifacts/{chrome,edge,firefox}.zip
```

### Load unpacked

- **Chrome / Edge**: `chrome://extensions` → enable Developer mode → Load unpacked → `dist/chrome` (or `dist/edge`)
- **Firefox**: `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → pick `dist/firefox/manifest.json`
- **Safari**: `xcrun safari-web-extension-converter dist/safari` — then build the generated Xcode project

In each browser you should see `[CTM Importer scaffold alive] background`, `... content`, `... popup`, `... options` in the relevant consoles. That is the only thing this scaffold does.

## What's next

Each of these will be a separate issue + branch:

- GPS file format detection (content script + `downloads.onDeterminingFilename`)
- Color The Map authentication flow
- Streaming upload to the CTM tusd endpoint
- Per-domain settings and toast UI
- Real icons and store listing assets
