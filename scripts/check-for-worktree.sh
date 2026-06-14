#!/bin/bash
# Check if we're in a git worktree or main repo
# Returns "worktree" or "main-repo" to stdout

if [ -f .git ]; then
    echo "worktree"
else
    echo "main-repo"
fi
