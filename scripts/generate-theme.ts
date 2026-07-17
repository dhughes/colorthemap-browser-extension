// Regenerates src/styles/theme.generated.css from the sibling Color The Map
// checkout. Runs automatically before `npm run dev` / `npm run build`; in CI
// (or without a CTM checkout) it leaves the committed file untouched so the
// extension stays self-contained for contributors without CTM.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";
import { ctmGitInfo, resolveCtmRepo } from "./theme/ctm-repo.ts";
import { assembleThemeCss } from "./theme/emit.ts";

const OUTPUT_RELATIVE = "src/styles/theme.generated.css";

if (process.env.CI) {
  console.log(
    "[generate:theme] CI — skipping regeneration, using the committed theme.generated.css",
  );
  process.exit(0);
}

const checkMode = process.argv.includes("--check");
const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const outputPath = join(repoRoot, OUTPUT_RELATIVE);

const ctm = resolveCtmRepo(process.env);
if (ctm === null) {
  console.warn(
    "[generate:theme] Color The Map checkout not found (expected as a sibling of the main repo; set CTM_REPO_PATH to override) — skipping regeneration, the committed theme.generated.css stays as-is",
  );
  process.exit(0);
}
if (!existsSync(ctm.path)) {
  console.error(
    `[generate:theme] CTM_REPO_PATH points at a missing directory: ${ctm.path}`,
  );
  process.exit(1);
}

const stylesDir = join(ctm.path, "frontend", "src", "styles");
const ladderCss = readFileSync(
  join(stylesDir, "tokens-ladder.generated.css"),
  "utf8",
);
const tokensV2Css = readFileSync(join(stylesDir, "tokens-v2.css"), "utf8");
const { sha, dirty } = ctmGitInfo(ctm.path);
const shortSha = sha.slice(0, 8);

const assembled = assembleThemeCss({
  ladderCss,
  tokensV2Css,
  sha: shortSha,
  dirty,
});
const prettierConfig = await prettier.resolveConfig(outputPath);
const formatted = await prettier.format(assembled, {
  ...prettierConfig,
  parser: "css",
});

const existing = existsSync(outputPath)
  ? readFileSync(outputPath, "utf8")
  : null;
const provenance = `color-the-map @ ${shortSha}${dirty ? ", dirty checkout" : ""}`;

if (existing === formatted) {
  console.log(`[generate:theme] up to date (${provenance})`);
} else if (checkMode) {
  console.error(
    `[generate:theme] stale: ${OUTPUT_RELATIVE} — run npm run generate:theme and commit the result`,
  );
  process.exit(1);
} else {
  writeFileSync(outputPath, formatted);
  console.log(`[generate:theme] wrote ${OUTPUT_RELATIVE} (${provenance})`);
}
