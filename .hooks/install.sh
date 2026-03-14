#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOKS_DIR="$REPO_ROOT/.hooks"

echo "Installing git hooks from $HOOKS_DIR"
git config core.hooksPath "$HOOKS_DIR"
chmod +x "$HOOKS_DIR"/pre-commit "$HOOKS_DIR"/pre-push
echo "Git hooks installed (core.hooksPath -> .hooks/)"
