#!/bin/bash
# Open a new iTerm2 window with Claude Code in a worktree directory.
#
# Usage: ./scripts/open-worktree-claude.sh <worktree-path> [initial-prompt]
#
# Arguments:
#   worktree-path  - Absolute path to the worktree directory
#   initial-prompt - Optional prompt to send to Claude on startup
#                    (defaults to "Prepare to start work on this worktree.")

WORKTREE_PATH="$1"
INITIAL_PROMPT="${2:-Prepare to start work on this worktree.}"

if [ -z "$WORKTREE_PATH" ]; then
    echo "Usage: $0 <worktree-path> [initial-prompt]"
    exit 1
fi

if [ ! -d "$WORKTREE_PATH" ]; then
    echo "Error: Directory does not exist: $WORKTREE_PATH"
    exit 1
fi

osascript -e "tell application \"iTerm2\" to create window with default profile command \"/bin/zsh -l -c \\\"cd $WORKTREE_PATH && source ~/.zshrc && /Users/doughughes/.local/bin/claude \\\\\\\"$INITIAL_PROMPT\\\\\\\"\\\"\""
