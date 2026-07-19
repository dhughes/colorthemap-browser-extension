import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import webExtension, { readJsonFile } from "vite-plugin-web-extension";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { toManifestVersion } from "./scripts/manifest-version";

const root = fileURLToPath(new URL(".", import.meta.url));

// Version flows from package.json — release-please bumps it on release, and local
// builds read whatever's committed (defaulting to 0.0.0). The build stamps it into
// every browser's manifest, overriding the placeholder in manifest.base.json.
const manifestVersion = toManifestVersion(
  (readJsonFile(resolve(root, "package.json")) as { version: string }).version,
);

// `vite build --watch` re-runs the plugin's buildStart on every rebuild, which
// empties the outDir when emptyOutDir is set — leaving a window where the loaded
// extension on disk is incomplete. One-shot builds clean up front via
// `npm run clean`, so only empty the outDir when we're not watching.
const isWatch = process.argv.includes("--watch");

// The browser targets. Adding one (e.g. Safari #5) means: an entry here, its
// manifest shape in generateManifest() below, and matching build:/package:
// scripts in package.json (the npm scripts drive one target per invocation).
const TARGETS = ["chrome", "edge", "firefox"] as const;
type Target = (typeof TARGETS)[number];

const isTarget = (value: string): value is Target =>
  TARGETS.includes(value as Target);

const target = process.env.TARGET_BROWSER ?? "chrome";
if (!isTarget(target)) {
  throw new Error(
    `Unknown TARGET_BROWSER "${target}". Expected one of: ${TARGETS.join(", ")}`,
  );
}

// Per-browser manifest variants. The plugin resolves the manifest template
// before it extracts build inputs, so entry paths here point at source files
// (relative to the `src` root below) and the plugin rewrites them to built
// filenames.
//
// Firefox MV3 rejects `background.service_worker` — it wants `background.scripts`
// — and needs a `browser_specific_settings.gecko` block. The base manifest's
// `key` (which pins the Chromium dev extension ID) is meaningless to Firefox,
// which identifies via `gecko.id`, so it's dropped from the Firefox variant.
// Chrome and Edge share the base shape.
function generateManifest() {
  const base = readJsonFile(resolve(root, "manifest.base.json"));
  base.version = manifestVersion;
  if (target === "firefox") {
    const firefoxManifest = {
      ...base,
      background: {
        scripts: ["background.ts"],
        type: "module",
      },
      browser_specific_settings: {
        gecko: {
          id: "ctm-importer@colorthemap.app",
          // Detector A's `world: "MAIN"` content script needs Firefox 128+.
          strict_min_version: "128.0",
        },
      },
    };
    delete firefoxManifest.key;
    return firefoxManifest;
  }
  return base;
}

export default defineConfig({
  // Root at src/ so built entry files land at the top of dist/<browser>/
  // (background.js, popup.html, …) rather than nested under src/.
  root: resolve(root, "src"),
  publicDir: resolve(root, "public"),
  build: {
    outDir: resolve(root, `dist/${target}`),
    emptyOutDir: !isWatch,
    sourcemap: true,
    target: "es2022",
  },
  plugins: [
    // Applies inside the plugin's per-entry child builds too (they load this
    // config file), so ?inline CSS in content scripts compiles as well.
    tailwindcss(),
    webExtension({
      manifest: generateManifest,
      // web-ext only knows 'firefox' vs Chromium; Edge validates as Chromium.
      browser: target === "firefox" ? "firefox" : "chrome",
      // We load the unpacked extension manually (see README), so don't let
      // web-ext spawn a browser in watch/dev mode.
      disableAutoLaunch: true,
      // Default validation fetches a JSON schema over the network with no
      // timeout (and validates every target against the Chrome schema), which
      // makes builds hang/fail non-deterministically off-network. `web-ext
      // build` validates at package time instead.
      skipManifestValidation: true,
      // Rebuild when the manifest source changes, not just src/ entries.
      watchFilePaths: [resolve(root, "manifest.base.json")],
    }),
  ],
});
