#!/bin/bash
# Setup a worktree (or fresh main checkout) for development.
# Idempotent — safe to run multiple times.

set -e

if [ "$(uname)" != "Darwin" ]; then
    echo "ERROR: This script is for local development only (macOS)."
    exit 1
fi

MAIN_REPO="/Users/doughughes/Projects/Personal/colorthemap-browser-extension"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKTREE_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$WORKTREE_ROOT"

echo "Setting up: $WORKTREE_ROOT"

if ! command -v node >/dev/null 2>&1; then
    echo "ERROR: node is not installed. Install with: brew install node"
    exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
    echo "ERROR: npm is not installed."
    exit 1
fi

if [ -d "node_modules" ]; then
    echo "node_modules already exists, skipping install."
else
    echo "Installing dependencies with npm ci..."
    npm ci
fi

if [ ! -f .claude/settings.local.json ] && [ -f "$MAIN_REPO/.claude/settings.local.json" ] && [ "$WORKTREE_ROOT" != "$MAIN_REPO" ]; then
    mkdir -p .claude
    cp "$MAIN_REPO/.claude/settings.local.json" .claude/settings.local.json
    echo "Copied .claude/settings.local.json from main repo"
fi

echo "Setup complete."
