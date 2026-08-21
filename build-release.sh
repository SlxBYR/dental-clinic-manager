#!/usr/bin/env bash
set -euo pipefail

# Backward-compatible entry point. New release builds use the selectable TUI.
exec "$(cd "$(dirname "$0")" && pwd)/scripts/package-tui.sh" "$@"
