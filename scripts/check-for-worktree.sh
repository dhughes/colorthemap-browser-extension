#!/bin/bash
# Check if we're in a git worktree or main repo.
# Prints "worktree", "main-repo", or "not-a-repo" to stdout.
#
# Compares the per-worktree gitdir against the repo's common gitdir — they're
# equal only in the main worktree. `--absolute-git-dir` and `--git-common-dir`
# normalize paths via git itself, so this works from any subdirectory and
# fails cleanly if either lookup errors instead of silently returning "".

git_dir=$(git rev-parse --absolute-git-dir 2>/dev/null) || { echo "not-a-repo"; exit 0; }
common_dir=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || { echo "not-a-repo"; exit 0; }

if [ "$git_dir" = "$common_dir" ]; then
    echo "main-repo"
else
    echo "worktree"
fi
