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
npm run build           # vite build + write per-browser manifests under dist/
npm test                # vitest
npm run dev             # vite build --watch
npm run package         # build + zip artifacts/{chrome,edge,firefox}.zip + Safari Xcode project (macOS only)
npm run package:safari  # just regenerate dist/safari-xcode/ (macOS only)
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

Safari does not load WebExtensions directly from a folder. Apple's policy is that every Safari extension ships inside a host macOS or iOS app. The build pipeline handles the converter step for you (on macOS):

```sh
npm run package:safari
```

This calls `xcrun safari-web-extension-converter` under the hood with non-interactive flags (`--force --no-open --swift`) and writes an Xcode project to `dist/safari-xcode/Color The Map Importer/`. The host macOS app it generates has one job: register the extension with Safari.

To verify a load:

1. `npm run build` (so `dist/safari/` exists)
2. `npm run package:safari` (so `dist/safari-xcode/` exists)
3. Open the Xcode project:
   ```sh
   open "dist/safari-xcode/Color The Map Importer/Color The Map Importer.xcodeproj"
   ```
4. In Xcode, pick the **Color The Map Importer (macOS)** scheme from the run-target dropdown (the converter also generates iOS targets you can ignore for now).
5. Hit **Run** (**⌘R**). Xcode builds the host app and launches it. A small window appears saying you can enable the extension in Safari.
6. In Safari:
   - **Settings → Advanced** → check **Show features for web developers** (one-time).
   - **Develop** menu → **Allow Unsigned Extensions** (resets every time you quit Safari — that's normal).
   - **Settings → Extensions** → check the box next to **Color The Map Importer**.

Where to see the alive markers in Safari:

- **Background**: Safari → **Develop → Web Extension Background Content → Color The Map Importer**. Web Inspector opens; Console tab.
- **Content script**: open any HTTP/HTTPS page, open Web Inspector (**⌥⌘I**), Console tab.
- **Popup**: click the toolbar icon; right-click inside the popup → **Inspect Element** for its Web Inspector.
- **Options**: opens as a tab (because `open_in_tab: true`); standard Web Inspector (**⌥⌘I**) applies.

Iterating on the Safari side after a code change:

1. Edit source.
2. `npm run build` (refreshes `dist/safari/`).
3. In Xcode, hit **⌘R** again — the host app's build-phase script re-copies resources from `dist/safari/`.
4. The extension reloads in Safari automatically.

You only need to re-run `npm run package:safari` if you want to regenerate the Xcode project itself (e.g. after changing the manifest schema or bundle identifier). It will overwrite any local Xcode-project tweaks because of `--force`.

Notes on `xcrun safari-web-extension-converter`:

- Requires full Xcode (not just the Command Line Tools). Install Xcode from the App Store first; `xcrun` will otherwise fail with `error: unable to find utility "safari-web-extension-converter"`.
- The script gates on `process.platform === 'darwin'`, so the same `npm run package` command on Linux CI runners silently skips the Safari step instead of erroring.
- For App Store distribution you'd later sign the host app with an Apple Developer ID and run a real `xcodebuild archive` — out of scope for the scaffold.

## What's next

Each of these will be a separate issue + branch:

- GPS file format detection (content script + `downloads.onDeterminingFilename`)
- Color The Map authentication flow
- Streaming upload to the CTM tusd endpoint
- Per-domain settings and toast UI
- Real icons and store listing assets
