// CI guard: a PR title must be a valid Conventional Commit. The repo squash-merges
// with "squash commit title = PR title", and release-please parses that commit to
// drive versioning — so the title is the contract. Kept as a zero-dependency,
// first-party script on purpose: no third-party GitHub Action sits in the
// release-critical path.
import { pathToFileURL } from "node:url";

export const ALLOWED_TYPES = [
  "feat",
  "fix",
  "docs",
  "chore",
  "refactor",
  "test",
  "ci",
  "build",
  "perf",
  "style",
  "revert",
] as const;

// type(optional-scope)!: subject — scope is any non-empty, paren-free string; the
// optional "!" marks a breaking change; a single space must follow the colon.
const TITLE_PATTERN = new RegExp(
  `^(?:${ALLOWED_TYPES.join("|")})(?:\\([^()\\r\\n]+\\))?!?: (.+)$`,
);

export function validatePrTitle(title: string): string | null {
  const match = TITLE_PATTERN.exec(title);
  if (match === null) {
    return (
      `"${title}" is not a valid Conventional Commit title. ` +
      `Expected "type(optional-scope): subject" — type must be one of: ` +
      `${ALLOWED_TYPES.join(", ")}. Mark breaking changes with "!", e.g. "feat!: …".`
    );
  }
  const subject = (match[1] ?? "").trim();
  if (subject.length === 0) {
    return `"${title}" has an empty subject after the colon.`;
  }
  return null;
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const title = process.env.PR_TITLE ?? "";
  const problem = validatePrTitle(title);
  if (problem !== null) {
    console.error(`[check:pr-title] ${problem}`);
    process.exit(1);
  }
  console.log(`[check:pr-title] OK: ${title}`);
}
