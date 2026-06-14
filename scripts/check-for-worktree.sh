#!/bin/bash
# Check if we're in a git worktree or main repo
# Returns "worktree", "main-repo", or "not-a-repo" to stdout
#
# Works from any subdirectory: compares the per-worktree gitdir against the
# repo's common gitdir — they're equal only in the main worktree.

git_dir=$(git rev-parse --git-dir 2>/dev/null) || { echo "not-a-repo"; exit 0; }
common_dir=$(git rev-parse --git-common-dir 2>/dev/null) || { echo "not-a-repo"; exit 0; }

# Normalize to absolute paths so the comparison isn't fooled by relative form.
git_dir_abs=$(cd "$git_dir" && pwd)
common_dir_abs=$(cd "$common_dir" && pwd)

if [ "$git_dir_abs" = "$common_dir_abs" ]; then
    echo "main-repo"
else
    echo "worktree"
fi
