# colorthemap-browser-extension

Cross-browser WebExtension that detects GPS file downloads (GPX/FIT/TCX/KML/KMZ) on any site and offers to import them into [Color The Map](https://github.com/dhughes/color-the-map).

Phase 1 plan: [issue #1](https://github.com/dhughes/colorthemap-browser-extension/issues/1).

## Status

This branch is the **project scaffold only** — Manifest V3 shell, build pipeline, and a marker that proves each surface loads. No detection, auth, or upload yet; those land in follow-up issues.

## Stack

- TypeScript + Vite (multi-entry build)
- Vitest for unit tests
- `webextension-polyfill` so the same source builds against Chrome, Edge, and Firefox
- Single `manifest.base.json`; `scripts/build-manifests.mjs` fans it out into per-browser `dist/` folders
- Safari is deferred to a follow-up issue (see [#5](https://github.com/dhughes/colorthemap-browser-extension/issues/5)) because its toolchain (Xcode + converter + signing) was disproportionate complexity for the scaffold milestone.

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

### Load the unpacked extension

Build first so `dist/` exists:

```sh
npm run build
```

This scaffold's only behaviour is to log `[CTM Importer scaffold alive] <surface>` in the relevant console for each of the four surfaces. Where to look for that message is called out in each section below.

#### Chrome

1. Open `chrome://extensions`.
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked**.
4. Choose the `dist/chrome` folder.
5. The extension appears with the puzzle-piece icon in the toolbar. Pin it if you want quick access.

Where to see the alive markers:

- **Background (service worker)**: on the extension card, click **service worker** (or **Inspect views: service worker**). A DevTools window opens — the marker is in its Console.
- **Content script**: open any HTTP/HTTPS page, open DevTools (⌥⌘I), Console tab.
- **Popup**: click the toolbar icon to open the popup. Right-click inside the popup → **Inspect** to open its DevTools.
- **Options**: on the extension card, click **Details** → **Extension options**. Open DevTools (⌥⌘I) on the resulting tab.

To pick up code changes, re-run `npm run build` and click the **reload** (↻) button on the extension card.

#### Edge

Identical to Chrome, just at `edge://extensions`. Load `dist/edge`.

#### Firefox

Firefox temporary add-ons are unloaded when the browser closes — fine for development.

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Pick **`dist/firefox/manifest.json`** (the file, not the folder).
4. The extension appears under **Temporary Extensions**.

Where to see the alive markers:

- **Background (service worker)**: on the extension's row, click **Inspect**. A DevTools window opens — marker is in its Console.
- **Content script**: open any HTTP/HTTPS page, open DevTools (⌥⌘I), Console tab.
- **Popup**: click the toolbar icon. To inspect, in `about:debugging` click **Inspect** on the row, then use its Multiprocess Toolbox — or simpler, right-click inside the popup → **Inspect**.
- **Options**: open `about:addons` → find the extension → **Preferences** (the options page opens in a tab). Use that tab's DevTools.

After a code change: `npm run build`, then in `about:debugging` click **Reload** on the extension's row.

#### Safari

Deferred — see [issue #5](https://github.com/dhughes/colorthemap-browser-extension/issues/5). Safari needs Xcode, the `safari-web-extension-converter` tool, and (for distribution) Apple Developer enrollment, which together added more complexity than the scaffold milestone warranted. The architecture is Safari-friendly (single manifest source, no Safari-specific assumptions in src/), so adding it back should be additive when #5 is picked up.

## What's next

Each of these will be a separate issue + branch:

- [#4](https://github.com/dhughes/colorthemap-browser-extension/issues/4) — GPS detection framework (three-detector pipeline, logging only)
- [#5](https://github.com/dhughes/colorthemap-browser-extension/issues/5) — Add Safari support
- Color The Map authentication flow
- Streaming upload to the CTM tusd endpoint
- Per-domain settings and toast UI
- Real icons and store listing assets
- CI/CD: tests + builds on PR/merge, marketplace auto-deploy where feasible
