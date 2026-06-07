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

Safari does not load WebExtensions directly from a folder. Apple's policy is that every Safari extension ships inside a host macOS or iOS app. The path to running one locally is:

1. Build the extension as usual (`npm run build`) — this produces `dist/safari/`.
2. Run Apple's converter, which wraps the extension folder into an Xcode project:
   ```sh
   xcrun safari-web-extension-converter dist/safari
   ```
3. The converter prints what it's about to create and asks for confirmation. Accept the defaults; it generates an Xcode project (by default placed next to `dist/safari/`) containing a small macOS app whose only job is to host the extension.
4. The converter launches Xcode with the project open. Hit **Run** (⌘R) — Xcode builds the host app and launches it.
5. Open Safari → **Settings → Extensions** — the extension is listed but disabled. Toggle it on. (You may also need to enable **Develop → Allow Unsigned Extensions** in Safari's Develop menu, which is itself enabled from **Settings → Advanced → Show features for web developers**.)

Where to see the alive markers in Safari:

- **Background**: Safari → **Develop → Web Extension Background Pages → Color The Map Importer**. Web Inspector opens; check the Console.
- **Content script**: open any HTTP/HTTPS page, open Web Inspector (⌥⌘I), Console.
- **Popup**: click the toolbar icon; right-click inside the popup → **Inspect Element** for its Web Inspector.
- **Options**: opens in a tab; standard Web Inspector applies.

Notes on `xcrun safari-web-extension-converter`:

- It is a one-shot scaffolder, not a build step. You run it once, then iterate by editing the source and re-running `npm run build` to refresh `dist/safari/`. The Xcode project copies from `dist/safari/` at its build time — re-build the host app in Xcode to pick up changes (it has a build-phase script that re-copies the resources).
- It requires Xcode (not just the Command Line Tools). Install Xcode from the App Store first; `xcrun` will otherwise fail with `error: unable to find utility "safari-web-extension-converter"`.
- Useful flags: `--bundle-identifier app.colorthemap.importer`, `--app-name "CTM Importer"`, `--copy-resources` (default copies; `--no-copy-resources` symlinks instead, handy when iterating).
- For App Store distribution you'd later sign the host app with a real Developer ID — out of scope for the scaffold.

## What's next

Each of these will be a separate issue + branch:

- GPS file format detection (content script + `downloads.onDeterminingFilename`)
- Color The Map authentication flow
- Streaming upload to the CTM tusd endpoint
- Per-domain settings and toast UI
- Real icons and store listing assets
