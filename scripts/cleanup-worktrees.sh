#!/usr/bin/env bash
# Bulk cleanup of worktrees whose PRs are merged or whose referenced issues are closed.
#
# Default: interactive. Use --dry-run to preview. Use --yes to skip the prompt.
#
# For branches whose underlying GitHub issue is closed but which have no PR (or whose PR
# was closed without merging), commits any uncommitted changes and force-pushes the branch
# to origin so the work isn't lost when the worktree is deleted.

set -euo pipefail

MAIN_REPO="$(cd "$(dirname "$0")/.." && pwd)"
WORKTREE_BASE="$HOME/.claude-worktrees/colorthemap-browser-extension"

if [ ! -d "$WORKTREE_BASE" ]; then
    echo "No worktree directory found at $WORKTREE_BASE"
    exit 0
fi

dry_run=false
auto_yes=false
for arg in "$@"; do
    case "$arg" in
        --dry-run) dry_run=true ;;
        --yes|-y) auto_yes=true ;;
    esac
done

if $dry_run; then
    echo "DRY RUN — no changes will be made."
    echo ""
fi

echo "Fetching closed GitHub issues..."
# Let gh's stderr go straight to the user's terminal. An auth/network failure
# previously turned every branch into "KEEPING (NO PR)" silently; now the
# script aborts loudly. Capture stdout only so the assignment fails on error.
if ! closed_issues_list=$(gh issue list --state closed --limit 10000 --json number --jq '.[].number'); then
    echo "ERROR: gh issue list failed. Cleanup needs GitHub connectivity to safely determine which branches are done." >&2
    exit 2
fi
echo ""

is_issue_closed() {
    local num="$1"
    echo "$closed_issues_list" | grep -qw "$num"
}

extract_issue_numbers() {
    local branch="$1"
    if [[ "$branch" =~ ^issue-([0-9]+)_ ]]; then
        echo "${BASH_REMATCH[1]}"
    elif [[ "$branch" =~ ^issues-([0-9]+(-[0-9]+)+)_ ]]; then
        echo "${BASH_REMATCH[1]}" | tr '-' ' '
    fi
}

all_referenced_issues_closed() {
    local branch="$1"
    local nums
    nums=$(extract_issue_numbers "$branch")
    [ -z "$nums" ] && return 1
    for n in $nums; do
        is_issue_closed "$n" || return 1
    done
    return 0
}

is_worktree_dirty() {
    local dir="$1"
    [ -d "$dir" ] || return 1
    if ! git -C "$dir" diff --quiet 2>/dev/null \
        || ! git -C "$dir" diff --cached --quiet 2>/dev/null \
        || [ -n "$(git -C "$dir" ls-files --others --exclude-standard 2>/dev/null)" ]; then
        return 0
    fi
    return 1
}

to_clean=()
to_clean_branches=()
to_clean_save_remote=()
skipped_dirty=0

for dir in "$WORKTREE_BASE"/*/; do
    [ -d "$dir" ] || continue
    dir_name=$(basename "$dir")

    branch=$(git -C "$dir" branch --show-current 2>/dev/null || true)

    pr_state=""
    if [ -n "$branch" ]; then
        # Sort by updatedAt desc so .[0] is the most-recently-touched PR.
        # `createdAt` would mis-order reopens (a stale PR reopened after a
        # newer abandoned one would still sort behind it). Bump --limit well
        # past gh's 30 default so the sort sees every PR for this head — a
        # client-side sort can't reorder records the server already truncated.
        pr_state=$(gh pr list --head "$branch" --state all --limit 200 --json state,updatedAt \
            --jq 'sort_by(.updatedAt) | reverse | .[0].state // empty' 2>/dev/null || true)
    fi

    cleanup_reason=""
    save_to_remote=false

    if [ -z "$branch" ]; then
        cleanup_reason="STALE DIRECTORY (no git worktree)"
    elif [[ "$pr_state" == "MERGED" ]]; then
        cleanup_reason="DONE (MERGED)"
    elif [[ "$pr_state" == "CLOSED" ]]; then
        cleanup_reason="DONE (PR CLOSED)"
        save_to_remote=true
    elif [ -z "$pr_state" ] && all_referenced_issues_closed "$branch"; then
        cleanup_reason="DONE (ISSUE CLOSED)"
        save_to_remote=true
    fi

    if [ -n "$cleanup_reason" ]; then
        if [ "$save_to_remote" = "false" ] && [ -n "$branch" ] && is_worktree_dirty "$dir"; then
            echo "SKIPPING ($cleanup_reason but DIRTY): $dir_name  [branch: ${branch:-none}]"
            skipped_dirty=$((skipped_dirty + 1))
            continue
        fi

        echo "$cleanup_reason: $dir_name  [branch: ${branch:-none}]"
        to_clean+=("$dir")
        to_clean_branches+=("$branch")
        to_clean_save_remote+=("$save_to_remote")
    else
        status_label="OPEN"
        if [ -z "$pr_state" ]; then
            status_label="NO PR"
        fi
        echo "KEEPING ($status_label): $dir_name  [branch: $branch]"
    fi
done

echo ""

if [ ${#to_clean[@]} -eq 0 ]; then
    if [ "$skipped_dirty" -gt 0 ]; then
        echo "$skipped_dirty worktree(s) skipped because they have uncommitted changes. Nothing else to clean up."
    else
        echo "Nothing to clean up."
    fi
    exit 0
fi

echo "${#to_clean[@]} worktree(s) to clean up."
if [ "$skipped_dirty" -gt 0 ]; then
    echo "$skipped_dirty worktree(s) skipped because they have uncommitted changes."
fi

if $dry_run; then
    echo ""
    echo "Run without --dry-run to delete them."
    exit 0
fi

if ! $auto_yes; then
    echo ""
    read -rp "Proceed with cleanup? [y/N] " confirm
    if [[ "$confirm" != [yY] ]]; then
        echo "Aborted."
        exit 0
    fi
fi

echo ""

for i in "${!to_clean[@]}"; do
    dir="${to_clean[$i]}"
    branch="${to_clean_branches[$i]}"
    save_to_remote="${to_clean_save_remote[$i]}"
    dir_name=$(basename "$dir")

    echo "--- Cleaning up: $dir_name ---"

    if [ "$save_to_remote" = "true" ] && [ -n "$branch" ] && [ -d "$dir" ]; then
        # Surface any untracked files but leave them in place — staging them
        # would risk force-pushing a stray .env / secret to origin during
        # cleanup. The user has to deal with untracked files themselves.
        untracked=$(git -C "$dir" ls-files --others --exclude-standard 2>/dev/null || true)
        if [ -n "$untracked" ]; then
            echo "  NOTE: untracked files present; leaving them in place." >&2
            echo "$untracked" | sed 's/^/    /' >&2
        fi

        # Snapshot tracked-file modifications, if any. If the only "dirty"
        # signal was untracked files, there is nothing to commit — skip the
        # snapshot but DO continue to the push so existing committed work on
        # the branch still reaches origin.
        # `git diff --quiet` exits 0 = clean, 1 = dirty, anything else = git
        # error (corrupted index, bad gitlink, etc). Distinguish so a real
        # repo problem doesn't silently get treated as "dirty" and produce a
        # misleading WIP snapshot commit on top of a broken state.
        # `|| diff_status=$?` keeps set -e from firing on the non-zero exit
        # AND captures the real status for the check below.
        tracked_dirty=false
        diff_status=0
        git -C "$dir" diff --quiet || diff_status=$?
        if [ "$diff_status" -eq 1 ]; then
            tracked_dirty=true
        elif [ "$diff_status" -ne 0 ]; then
            echo "  WARNING: git diff failed (exit $diff_status); skipping this worktree." >&2
            continue
        fi
        cached_status=0
        git -C "$dir" diff --cached --quiet || cached_status=$?
        if [ "$cached_status" -eq 1 ]; then
            tracked_dirty=true
        elif [ "$cached_status" -ne 0 ]; then
            echo "  WARNING: git diff --cached failed (exit $cached_status); skipping this worktree." >&2
            continue
        fi

        if [ "$tracked_dirty" = "true" ]; then
            echo "  Committing modifications to tracked files..."
            if ! git -C "$dir" add -u; then
                echo "  WARNING: git add failed; skipping push and cleanup for this worktree."
                echo ""
                continue
            fi
            # Pre-commit hooks (lint, secret-scan, etc.) should be allowed to
            # run — they're the defense-in-depth that would catch a secret
            # accidentally staged via a tracked-file edit. If the hook fails,
            # we fail loudly rather than silently bypassing it.
            if ! git -C "$dir" commit -m "WIP: pre-cleanup snapshot"; then
                echo "  WARNING: commit failed (likely a pre-commit hook); skipping push and cleanup for this worktree."
                echo ""
                continue
            fi
        fi

        echo "  Pushing branch to origin (force, set upstream)..."
        if ! git -C "$dir" push --force --set-upstream origin "$branch"; then
            echo "  WARNING: push failed; skipping cleanup for this worktree."
            echo ""
            continue
        fi
    fi

    if [ -n "$branch" ]; then
        echo "  Removing worktree..."
        git -C "$MAIN_REPO" worktree remove --force "$dir" 2>/dev/null || true
    fi

    if [ -d "$dir" ]; then
        echo "  Removing leftover directory..."
        rm -rf "$dir"
    fi

    if [ -n "$branch" ]; then
        echo "  Deleting branch: $branch"
        git -C "$MAIN_REPO" branch -D "$branch" 2>/dev/null || echo "  (branch already gone)"
    fi

    echo ""
done

echo "Cleanup complete."
