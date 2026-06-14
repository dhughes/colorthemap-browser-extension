# CLAUDE.md

Guidance for Claude Code when working in this repo. Sibling to (and modeled on) the CLAUDE.md in `../color-the-map`.

## Communication Guidelines

**CRITICAL:** When you need to ask the user a question, ALWAYS use the `AskUserQuestion` tool instead of embedding the question in a long response. Use it multiple times if you have multiple questions. Buried questions are easy to miss.

**CRITICAL:** NEVER push to GitHub without explicit user permission. Always ask first, even when it seems obvious.

## Code Quality

**Leave the code in a better place than you found it.** Boy scout rule, every change.

- **Clean up as you go.** When you touch a file, fix small issues nearby — typos, dead code, misleading names, missing types, stale comments. Not the same as gold-plating — don't refactor unrelated code, but don't leave a mess where you've been working either.
- **Don't punt fixable tech debt.** If it can be addressed in the moment without significantly expanding the change, address it. "We'll clean it up later" usually means never.
- **Take non-blocking PR feedback seriously.** Reviewer "nit" or "non-blocking" comments still represent real quality concerns. Apply them unless you genuinely disagree (and then push back with reasoning, not reflexively).
- **When in doubt, ask the user.** Use `AskUserQuestion` rather than silently deciding.

## Project Overview

Cross-browser WebExtension (Manifest V3) that detects GPS file downloads (GPX / FIT / TCX / KML / KMZ) on any site and offers to import them into [Color The Map](https://github.com/dhughes/color-the-map).

Phase 1 epic: [#1](https://github.com/dhughes/colorthemap-browser-extension/issues/1). Architecture, three-detector model, auth flow, and remaining work are tracked as numbered follow-ups (#4 detection, #5 Safari, #6 CI, #7 release pipeline, #8 marketplace publishing, #9 privacy policy, #10 auth).

Target browsers at launch: Chrome, Edge, Firefox. Safari is deferred to #5.

## Architecture (don't re-derive)

- **`manifest.base.json` is the single source of truth.** The build runs through [`vite-plugin-web-extension`](https://github.com/aklinker1/vite-plugin-web-extension): `vite.config.ts` reads the base manifest and `generateManifest()` applies per-browser variants, building each target into `dist/{chrome,edge,firefox}/`. Firefox gets `background.scripts` instead of `service_worker` (Firefox MV3 doesn't accept the latter) plus `browser_specific_settings.gecko`. Per-browser variants belong in `generateManifest()`, never as duplicated manifest files. The target is selected by `TARGET_BROWSER`; `npm run build` loops all three.
- **MV3 content scripts cannot use ES module imports.** The plugin bundles every script entry — both the content script and the background SW — as a standalone IIFE with shared `src/` modules inlined (so the SW's `type: module` is effectively cosmetic; don't rely on real module-SW semantics like dynamic `import()` of a sibling chunk). Only the HTML pages (popup, options) carry module scripts. One `vite.config.ts` — no second config, no manifest fan-out script. `vitest.config.ts` is kept separate so the build plugin doesn't run during unit tests.
- **`webextension-polyfill`** is the cross-browser primitive — same source builds for Chrome / Edge / Firefox.
- **Auth flow** (when #10 lands) is OAuth Authorization Code + PKCE via `chrome.identity.launchWebAuthFlow`, talking to CTM's `/oauth/authorize` and `/oauth/token`. All token state and refresh logic live in the background SW with a single-flight refresh guard. See #10 for full design.
- **Three-detector pipeline** for download detection: DOM scan + badge (all browsers), main-world fetch/XHR wrap (all browsers), `chrome.downloads.onDeterminingFilename` (Chrome / Edge / Firefox only). See #4.

## Development Commands

### Running Commands

**CRITICAL: One command per Bash tool call.**

No `&&`, `||`, `;`, or `|` chaining. No multi-line commands. **Exception:** heredocs wrapped in `"$(cat <<'EOF'...EOF)"` for passing long bodies to `git commit -m`, `gh pr create --body`, `gh issue create --body`, etc.

**CRITICAL: Use relative paths, not absolute paths.** Run commands like `./scripts/setup-worktree.sh`, not the absolute path. If a command fails because the file isn't found, check your current directory with `pwd` — if you've drifted into a subdirectory, `cd` back to the project root rather than switching to absolute paths.

### Local Development

```bash
npm install            # one-time, or after dep changes
npm run build          # build dist/{chrome,edge,firefox}/
npm test               # vitest
npm run typecheck      # tsc --noEmit
npm run dev            # rebuild dist/chrome/ on every source change
npm run package        # build + zip artifacts/{chrome,edge,firefox}.zip
```

**Loading the unpacked extension:** see README.md — has the per-browser walkthrough.

### Worktree Development (Parallel Development)

Each git worktree needs its own `node_modules` (platform-specific binaries).

**Worktree Setup (run once per new worktree):**
```bash
./scripts/setup-worktree.sh
```

Idempotent. Runs `npm ci` if `node_modules` is missing, and copies the main repo's `.claude/settings.local.json` if the worktree doesn't have one (so permission grants carry over).

**For Claude Code:** Before running any npm commands, check if `node_modules` exists. If not, run `./scripts/setup-worktree.sh` first.

**Helper Scripts for Environment Checks (pre-approved):**
```bash
./scripts/check-for-worktree.sh         # Returns "worktree" or "main-repo"
./scripts/check-node-modules-exists.sh  # Returns "exists" or "missing"
```

### Creating a Worktree

When the user asks to "create a worktree for [topic]", "spin up a worktree for X", or "look at issue #123 and create a worktree for it":

1. **Gather minimal context.** If a GitHub issue is referenced, read the title / description with `gh issue view` (just enough to pick a sensible branch name). If a topic is described, use that directly. Don't pile on questions — infer a reasonable name.
2. **Choose a branch name.** Kebab-case derived from the topic:
   - **For GitHub issues:** `issue-<number>_<kebab-case-description>` (e.g., `issue-4_detection-framework`)
   - **For topics without an issue:** `<kebab-case-description>` (e.g., `experiment-strava-detection`)
3. **Create the worktree:** `git worktree add ~/.claude-worktrees/colorthemap-browser-extension/<branch-name> -b <branch-name>`
4. **Open a new iTerm2 window with Claude:**
   ```bash
   ./scripts/open-worktree-claude.sh ~/.claude-worktrees/colorthemap-browser-extension/<branch-name>
   ```

### Worktree Initialization (New Claude Instance)

When you receive the message **"Prepare to start work on this worktree"** (this is what `open-worktree-claude.sh` sends by default):

1. **Run worktree setup:** `./scripts/setup-worktree.sh`
2. **Check for a GitHub issue.** Look at the current branch name (`git branch --show-current`). If it matches `issue-<number>_...` or `issues-<number>-<number>_...`, read each issue with `gh issue view <number>` to understand the context.
3. **Report readiness.** Tell the user the environment is ready, summarize the issue if one was found, and wait for further instructions. Don't start writing code unprompted.

There are no dev servers to start (unlike CTM) — extensions are loaded into the browser unpacked, not served. So initialization is just setup + context + ready signal.

### Worktree Cleanup

**Bulk cleanup (recommended):** Run from the main repo to clean up worktrees whose PRs have been merged or closed:

```bash
./scripts/cleanup-worktrees.sh           # interactive — prompts before deleting
./scripts/cleanup-worktrees.sh --dry-run # preview what would be cleaned
./scripts/cleanup-worktrees.sh --yes     # skip the prompt
```

Scans `~/.claude-worktrees/colorthemap-browser-extension/`, checks each worktree's branch against GitHub PR status, and cleans up worktrees with merged or closed PRs. For each it:

1. If the branch's PR was closed without merge (or the referenced issue is closed but no PR exists), commits any uncommitted work as a WIP snapshot and force-pushes to origin so the work survives.
2. Removes the git worktree (`git worktree remove --force`).
3. Removes any leftover directory.
4. Deletes the local branch (`git branch -D`).

Worktrees with open PRs or no PR (and clean tree) are left alone. Worktrees whose work isn't saved-to-remote and are dirty are skipped with a warning.

**For Claude Code:** When the user asks to clean up worktrees:
1. Run `./scripts/cleanup-worktrees.sh --dry-run` first to show what will be cleaned.
2. Run `./scripts/cleanup-worktrees.sh --yes` to execute.
3. Report what was cleaned.

**Single-worktree cleanup ("wrap up this worktree"):** see the `worktree-cleanup` skill in `.claude/skills/`.

## Testing

- Unit tests are important. Write tests early.
- Use Vitest for everything testable in isolation: pure data (formats table, PKCE helpers, message-bus payloads), service-layer logic (auth state machine, refresh guard), URL / sniff helpers.
- Detector-layer code that depends on real browser APIs needs manual verification in each browser — Vitest can mock `chrome.*` but the integration is what actually matters.
- Don't test private functions. Test behavior, not implementation.

## Memory

This repo has a memory directory at `/Users/doughughes/.claude/projects/-Users-doughughes-Projects-Personal-colorthemap-browser-extension/memory/`. The `MEMORY.md` index is loaded into context automatically; individual memory files contain decisions, architecture notes, and project state that should persist across conversations.

Update memory entries when they go stale rather than letting them rot.

## What's NOT here that's in CTM's CLAUDE.md

This repo deliberately doesn't have:
- Postgres / database setup (no backend)
- Python / uv (no Python)
- tusd / dev tunnel (no upload sidecar — uploads go to CTM's tusd)
- Multi-port dev server orchestration (extensions load into browsers, no server to run)
- Auto-tag PR-label workflow (will land with #7 / #8 — defer to those when they ship)
- OSM data (irrelevant)
- Per-component CSS conventions (no React; we use vanilla DOM for popup / options)

If you're tempted to add equivalents of those here, double-check they apply to a browser extension before doing it.
