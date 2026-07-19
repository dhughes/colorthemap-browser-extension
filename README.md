# colorthemap-browser-extension

Cross-browser WebExtension that detects GPS file downloads (GPX/FIT/TCX/KML/KMZ) on any site and offers to import them into [Color The Map](https://github.com/dhughes/color-the-map).

Phase 1 plan: [issue #1](https://github.com/dhughes/colorthemap-browser-extension/issues/1).

## Status

In progress. Landed so far: the MV3 shell + build pipeline, the GPS **detection** framework ([#4](https://github.com/dhughes/colorthemap-browser-extension/issues/4), logging only), and **Color The Map authentication** ([#10](https://github.com/dhughes/colorthemap-browser-extension/issues/10), OAuth Authorization Code + PKCE). Still to come: streaming upload to CTM, per-site settings, and Safari.

## Stack

- TypeScript + Vite, built with [`vite-plugin-web-extension`](https://github.com/aklinker1/vite-plugin-web-extension)
- Tailwind v4 on design tokens generated from Color The Map's canonical sources (see `src/styles/README.md`)
- Vitest for unit tests
- `webextension-polyfill` so the same source builds against Chrome, Edge, and Firefox
- Single `manifest.base.json`; `vite.config.ts` builds it per-browser into `dist/{chrome,edge,firefox}/`
- Safari is deferred to a follow-up issue (see [#5](https://github.com/dhughes/colorthemap-browser-extension/issues/5)) because its toolchain (Xcode + converter + signing) was disproportionate complexity for the scaffold milestone.

## Layout

```
src/
  background.ts     # MV3 service worker (module): auth flow, detection log, alarms
  content.ts        # content script injected on <all_urls>
  options.html      # options page (open_in_tab) — the single UI hub
  options.ts
  auth/             # OAuth: pkce, api, storage, service, alarms, errors, messages
  detectors/        # GPS-download detectors A/B/C (#4)
  ui/               # shared options/popup-surface helpers (authPanel)
  shared/           # formats, sniffing, dedupe, detection bus, alive marker
  styles/           # Tailwind v4 on tokens generated from CTM (see styles/README.md)
manifest.base.json  # source of truth, transformed per-browser at build time
vite.config.ts      # vite-plugin-web-extension build (per-browser)
vitest.config.ts    # unit test config
public/             # static assets copied as-is into each dist (icons, logo)
```

## Dev

Requires Node 22.12+ (pin: 24.12.0 via `.nvmrc`). Use `nvm use` or let your tooling pick it up automatically.

```sh
npm install
pre-commit install  # one-time: hooks for lint/typecheck/prettier on commit
npm run build       # build dist/{chrome,edge,firefox}/
npm test            # vitest
npm run dev         # rebuild dist/chrome/ on every source change
npm run package     # build + zip artifacts/{chrome,edge,firefox}.zip
```

`pre-commit` is a Python tool. Install it with `brew install pre-commit` or `pip install pre-commit`. Once installed, `pre-commit install` wires up the hooks — lint, typecheck, and Prettier will run automatically on `git commit`.

`npm run dev` builds Chrome into `dist/chrome/` and rebuilds on every edit; load it
unpacked (see below) and hit reload after a change. To watch a different browser,
run e.g. `TARGET_BROWSER=firefox npx vite build --watch`.

### Load the unpacked extension

Build first so `dist/` exists:

```sh
npm run build
```

Each surface still logs `[CTM Importer scaffold alive] <surface>` on load (background, content, options). Where to look for that message — and the other DevTools entry points — is called out in each section below.

#### Chrome

1. Open `chrome://extensions`.
2. Toggle **Developer mode** on (top-right).
3. Click **Load unpacked**.
4. Choose the `dist/chrome` folder.
5. The extension appears with the puzzle-piece icon in the toolbar. Pin it if you want quick access.

Where to see the alive markers:

- **Background (service worker)**: on the extension card, click **service worker** (or **Inspect views: service worker**). A DevTools window opens — the marker is in its Console.
- **Content script**: open any HTTP/HTTPS page, open DevTools (⌥⌘I), Console tab.
- **Toolbar button**: clicking the toolbar icon opens the settings/options page (there is no popup). Confirm the ID shows as `jofhleeceicfjcdphnbbnhiolcddcopi` (pinned dev key).
- **Options**: the toolbar button, or the extension card's **Details** → **Extension options**. Open DevTools (⌥⌘I) on the resulting tab.

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
- **Toolbar button**: clicking the toolbar icon opens the settings/options page (there is no popup).
- **Options**: the toolbar button, or `about:addons` → find the extension → **Preferences** (opens the options page in a tab). Use that tab's DevTools.

After a code change: `npm run build`, then in `about:debugging` click **Reload** on the extension's row.

#### Safari

Deferred — see [issue #5](https://github.com/dhughes/colorthemap-browser-extension/issues/5). Safari needs Xcode, the `safari-web-extension-converter` tool, and (for distribution) Apple Developer enrollment, which together added more complexity than the scaffold milestone warranted. The architecture is Safari-friendly (single manifest source, no Safari-specific assumptions in src/), so adding it back should be additive when #5 is picked up.

## Authentication

The extension authenticates against Color The Map using OAuth Authorization
Code + PKCE ([#10](https://github.com/dhughes/colorthemap-browser-extension/issues/10)).
Clicking **Connect** opens CTM's `/oauth/authorize` page via
`chrome.identity.launchWebAuthFlow`; after sign-in the extension exchanges the
code at `/oauth/token` and stores the tokens in the background service worker
(silent, proactive refresh; single account at a time). The target CTM origin is
selected at build time via the `VITE_CTM_BASE_URL` env var — it **defaults to
`https://dev.colorthemap.app`**; set `VITE_CTM_BASE_URL=https://colorthemap.app`
for a production build.

### Deploy coordination (required before auth works) ⚠️

CTM validates the extension's redirect URI against its
`OAUTH_EXTENSION_REDIRECT_URIS` env var (see
[color-the-map#867](https://github.com/dhughes/color-the-map/pull/867)). Each
target environment must include this extension's redirect URIs **before**
Connect will succeed there:

- **Chrome / Edge (dev, pinned key):** `https://jofhleeceicfjcdphnbbnhiolcddcopi.chromiumapp.org/*`
- **Firefox (dev + prod, from `gecko.id`):** `https://a241358d0f3749a5b1e4d44ec3c8a1d37329597b.extensions.allizom.org/*`
- **Chrome / Edge (prod):** the store-assigned IDs' `*.chromiumapp.org/*`, added at publish time.

The CTM **dev** environment needs the dev URIs; the CTM **prod** environment
needs prod + dev (so a real unpacked extension can be tested against prod).

## Releases

Releases are automated with [release-please](https://github.com/googleapis/release-please) and driven entirely by [Conventional Commit](https://www.conventionalcommits.org/) PR titles (see the commit conventions in `CLAUDE.md`). There is **no manual tagging**.

1. Merge PRs into `main`. Each PR is squash-merged and its title is a Conventional Commit (`feat:`, `fix:`, …): `feat` triggers a minor bump, `fix` a patch, and a `!` / `BREAKING CHANGE` a major.
2. release-please maintains an open **release PR** that bumps the version in `package.json` and updates `CHANGELOG.md` from those commits.
3. When you're ready to ship, **merge the release PR**. release-please tags the commit `vX.Y.Z`, publishes a GitHub Release with generated notes, and the workflow re-runs the full checks, builds all three browsers, and attaches `chrome.zip`, `edge.zip`, and `firefox.zip`.

The git tag drives nothing on its own — the version is stamped into each `manifest.json` at build time from `package.json` (which release-please keeps in sync). Local `npm run build` without a release stamps whatever `package.json` currently holds (default `0.0.0`). At runtime the extension reads its own version via `browser.runtime.getManifest().version`.

**For testers:** grab the latest zip from the [Releases page](https://github.com/dhughes/colorthemap-browser-extension/releases) and load it unpacked (see [Load the unpacked extension](#load-the-unpacked-extension) above) — no store review queue required.

> **Repo settings this relies on** (already configured): squash-merge only with the PR title as the squash commit title, and **Settings → Actions → General → "Allow GitHub Actions to create and approve pull requests"** enabled, so release-please can open its release PR.

## What's next

Each of these will be a separate issue + branch:

- [#5](https://github.com/dhughes/colorthemap-browser-extension/issues/5) — Add Safari support
- Streaming upload to the CTM tusd endpoint
- Detector "sign in to send" affordance when logged out (wires the badge/toast to the auth flow)
- Per-domain settings and toast UI
- Real store listing assets
- CI/CD: marketplace auto-deploy where feasible
