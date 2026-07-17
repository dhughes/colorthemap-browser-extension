// CI guard: the committed theme.generated.css is present and well-formed.
// Deliberately NOT a staleness check — CI has no CTM checkout to compare
// against; freshness is generate-theme.ts --check's job, locally.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripComments } from "./theme/parse.ts";

export function validateThemeCss(content: string): string[] {
  if (content.trim().length === 0) {
    return ["file is empty"];
  }
  const problems: string[] = [];
  if (!content.includes("GENERATED FILE")) {
    problems.push("missing the GENERATED FILE banner");
  }
  if (!content.includes(":root")) {
    problems.push("missing a :root token scope");
  }
  if (!content.includes(":host")) {
    problems.push("missing the :host scope (shadow roots would be unstyled)");
  }
  if (!content.includes("@theme")) {
    problems.push("missing the @theme Tailwind mapping");
  }
  let depth = 0;
  for (const ch of stripComments(content)) {
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth < 0) {
        break;
      }
    }
  }
  if (depth !== 0) {
    problems.push("unbalanced braces — the file does not parse as CSS");
  }
  return problems;
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const path = join(
    fileURLToPath(new URL("..", import.meta.url)),
    "src",
    "styles",
    "theme.generated.css",
  );
  let content: string;
  try {
    content = readFileSync(path, "utf8");
  } catch {
    console.error(
      `[check:theme] missing: ${path} — run npm run generate:theme and commit the result`,
    );
    process.exit(1);
  }
  const problems = validateThemeCss(content);
  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(`[check:theme] ${problem}`);
    }
    process.exit(1);
  }
  console.log("[check:theme] theme.generated.css present and well-formed");
}
