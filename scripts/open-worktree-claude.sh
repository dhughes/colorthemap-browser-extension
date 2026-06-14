#!/bin/bash
# Open a new iTerm2 window with Claude Code in a worktree directory.
#
# Usage: ./scripts/open-worktree-claude.sh <worktree-path> [initial-prompt]
#
# Arguments:
#   worktree-path  - Absolute path to the worktree directory
#   initial-prompt - Optional prompt to send to Claude on startup
#                    (defaults to "Prepare to start work on this worktree.")
#
# Path and prompt round-trip safely through whatever characters bash %q can
# represent — spaces, quotes, $, backticks, newlines. The osascript layer
# only ever sees a single absolute path to a launch script.

set -e

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

CLAUDE_BIN="${CLAUDE_BIN:-$HOME/.local/bin/claude}"

# Write the launch command to a temp script and let osascript invoke that.
# Avoids 4+ levels of nested shell/AppleScript quoting and the injection that
# comes with it. printf %q shell-quotes each interpolated value so it's
# tokenized safely by zsh.
#
# macOS mktemp -t treats its argument as a literal prefix (XXXXXX is NOT
# expanded inside the template), so just give it a short prefix and let
# mktemp append its own random suffix.
launch_script=$(mktemp -t ctm-open-worktree)
chmod 700 "$launch_script"

# We CANNOT trap EXIT to delete the launch script: osascript returns the
# moment AppleScript dispatches the "create window" message, but iTerm2 may
# take noticeably longer (cold start, slow disk) to actually fork the zsh
# that reads the script. An EXIT trap would delete the file before zsh
# sees it. Cleanup story for the failure paths:
#   - INT/TERM: user interrupted between mktemp and osascript.
#   - ERR: a command failed under `set -e` (e.g. chmod, printf %q).
#   - osascript itself returns non-zero: explicit `||` branch below.
#   - Happy path: launch script self-deletes on its first line as zsh execs it.
trap 'rm -f "$launch_script"' INT TERM ERR

WORKTREE_PATH_Q=$(printf '%q' "$WORKTREE_PATH")
INITIAL_PROMPT_Q=$(printf '%q' "$INITIAL_PROMPT")
CLAUDE_BIN_Q=$(printf '%q' "$CLAUDE_BIN")
LAUNCH_SCRIPT_Q=$(printf '%q' "$launch_script")

cat > "$launch_script" <<EOS
#!/bin/zsh -l
rm -f $LAUNCH_SCRIPT_Q
cd $WORKTREE_PATH_Q || exit 1
source ~/.zshrc 2>/dev/null || true
exec $CLAUDE_BIN_Q $INITIAL_PROMPT_Q
EOS

osascript <<EOA || { osa_status=$?; rm -f "$launch_script"; echo "Error: osascript exited with status $osa_status. Is iTerm2 installed?" >&2; exit "$osa_status"; }
tell application "iTerm2"
    create window with default profile command "$launch_script"
end tell
EOA
