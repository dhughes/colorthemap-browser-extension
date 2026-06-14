---
name: Worktree Cleanup
description: This skill should be used when the user says "wrap up this worktree", "merge settings to main", "copy settings to main", "apply settings to main", "clean up this worktree", "I'm done with this worktree", or wants to merge their worktree's .claude/settings.local.json permissions back to the main branch.
---

# Worktree Cleanup

Merge worktree permissions back to the main repo. Preserves permissions granted during development so future worktrees inherit them.

Unlike the sibling skill in `../color-the-map`, this skill is minimal: there are no Postgres databases to drop, no port registry to release, and no background dev servers to stop. Extensions load into the browser unpacked — there is nothing server-side to tear down.

## When to Use

When the user indicates they're done with a worktree and want to preserve their permission grants for future worktrees.

## Procedure

### 1. Merge settings.local.json

Read the current worktree's `.claude/settings.local.json` and the main repo's copy at `/Users/doughughes/Projects/Personal/colorthemap-browser-extension/.claude/settings.local.json`.

Merge the `permissions.allow` arrays:
- Take the union of both arrays (no duplicates)
- Sort alphabetically for consistency
- Write the merged result back to the **main repo's** `.claude/settings.local.json`

Do the same for `permissions.deny` if it exists.

If the main repo has no `settings.local.json` yet, copy the worktree's file directly.

If the worktree has no `settings.local.json`, skip this step.

### 2. Report

Tell the user:
- How many new permissions were merged (if any), or that nothing needed merging
- Remind them to close the iTerm window — the worktree directory and git branch will be cleaned up by `./scripts/cleanup-worktrees.sh` (run from the main repo) after the PR is merged

**Do NOT attempt to delete the worktree directory or branch yourself.** A Claude session running inside a worktree cannot remove the worktree it's running in (git refuses, and the directory is your CWD). That's the user's job — they close the window, and the bulk cleanup script does the rest after the PR is merged.
