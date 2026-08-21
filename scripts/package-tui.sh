#!/usr/bin/env bash
set -euo pipefail

# Interactive release builder. It only relies on Bash and standard command-line
# tools, so a clean development machine does not need dialog, gum, or fzf.

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ARTIFACT_DIR="$ROOT_DIR/release"
STAGING_DIR=""
cd "$ROOT_DIR"

cleanup() {
  if [[ -n "$STAGING_DIR" && -d "$STAGING_DIR" ]]; then
    rm -rf -- "$STAGING_DIR"
  fi
}

trap cleanup EXIT INT TERM

print_menu() {
  clear
  printf '%s\n' '╔══════════════════════════════════════════╗'
  printf '%s\n' '║     DentalSystem release package tool     ║'
  printf '%s\n' '╚══════════════════════════════════════════╝'
  printf '%s\n\n' 'Select the installer(s) to build:'
  printf '%s\n' '  1) Windows x64 installer (.exe)'
  printf '%s\n' '  2) macOS Apple Silicon installer (.dmg)'
  printf '%s\n' '  3) macOS Intel x64 installer (.dmg)'
  printf '%s\n' '  4) Linux x64 installer (.deb)'
  printf '%s\n' '  5) All installers'
  printf '%s\n' '  6) Quit'
}

choose_target() {
  case "${1:-}" in
    --windows) TARGET="windows" ;;
    --macos) TARGET="macos-arm64" ;;
    --macos-intel) TARGET="macos-x64" ;;
    --linux) TARGET="linux" ;;
    --all) TARGET="all" ;;
    "")
      while true; do
        print_menu
        read -r -p 'Enter 1-6: ' selection
        case "$selection" in
          1) TARGET="windows"; break ;;
          2) TARGET="macos-arm64"; break ;;
          3) TARGET="macos-x64"; break ;;
          4) TARGET="linux"; break ;;
          5) TARGET="all"; break ;;
          6) exit 0 ;;
          *) printf 'Please enter a number from 1 to 6.\n'; sleep 1 ;;
        esac
      done
      ;;
    *)
      printf 'Usage: %s [--windows|--macos|--macos-intel|--linux|--all]\n' "$0" >&2
      exit 2
      ;;
  esac
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    printf 'Missing required command: %s\n' "$1" >&2
    exit 1
  }
}

show_artifacts() {
  printf '\nBuild complete. Installer(s) created in release/:\n'
  find "$ARTIFACT_DIR" -maxdepth 1 -type f \( -name '*.dmg' -o -name '*.exe' -o -name '*.deb' \) -print | sort
  if [[ "$TARGET" == "windows" || "$TARGET" == "all" ]]; then
    printf '%s\n' 'Windows packages include resources/maintenance/DentalSystem-Uninstall-Helper.cmd.'
  fi
}

publish_installers() {
  local artifact
  local expected_count=1
  local -a installers=()

  if [[ "$TARGET" == "all" ]]; then
    expected_count=4
  fi

  while IFS= read -r -d '' artifact; do
    case "$artifact" in
      *.exe)
        if [[ "$TARGET" == "windows" || "$TARGET" == "all" ]]; then
          installers+=("$artifact")
        fi
        ;;
      *-arm64.dmg)
        if [[ "$TARGET" == "macos-arm64" || "$TARGET" == "all" ]]; then
          installers+=("$artifact")
        fi
        ;;
      *-x64.dmg)
        if [[ "$TARGET" == "macos-x64" || "$TARGET" == "all" ]]; then
          installers+=("$artifact")
        fi
        ;;
      *.deb)
        if [[ "$TARGET" == "linux" || "$TARGET" == "all" ]]; then
          installers+=("$artifact")
        fi
        ;;
    esac
  done < <(find "$STAGING_DIR" -maxdepth 1 -type f \( -name '*.dmg' -o -name '*.exe' -o -name '*.deb' \) -print0)

  if [[ "${#installers[@]}" -ne "$expected_count" ]]; then
    printf 'Expected %s installer(s), but found %s. Existing release files were kept.\n' \
      "$expected_count" "${#installers[@]}" >&2
    exit 1
  fi

  mkdir -p "$ARTIFACT_DIR"
  find "$ARTIFACT_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
  for artifact in "${installers[@]}"; do
    cp -p -- "$artifact" "$ARTIFACT_DIR/"
  done
}

choose_target "${1:-}"
require_command node
require_command npm
require_command npx

if command -v python3 >/dev/null 2>&1 && python3 -c 'from PIL import Image' >/dev/null 2>&1; then
  printf '%s\n' 'Generating application icons...'
  python3 scripts/generate-rounded-icon.py
else
  printf '%s\n' 'Pillow is unavailable; using the checked-in application icons.'
fi

printf '%s\n' 'Building the application...'
npm run build

STAGING_DIR="$(mktemp -d "${TMPDIR:-/tmp}/dentalsystem-package.XXXXXX")"

case "$TARGET" in
  windows)
    printf '%s\n' 'Building Windows x64 installer...'
    npx electron-builder --win nsis --x64 --publish never --config.directories.output="$STAGING_DIR"
    ;;
  macos-arm64)
    printf '%s\n' 'Building macOS Apple Silicon installer...'
    npx electron-builder --mac dmg --arm64 --publish never --config.directories.output="$STAGING_DIR"
    ;;
  macos-x64)
    printf '%s\n' 'Building macOS Intel x64 installer...'
    npx electron-builder --mac dmg --x64 --publish never --config.directories.output="$STAGING_DIR"
    ;;
  linux)
    printf '%s\n' 'Building Linux x64 installer...'
    npx electron-builder --linux deb --x64 --publish never --config.directories.output="$STAGING_DIR"
    ;;
  all)
    printf '%s\n' 'Building Windows x64 installer...'
    npx electron-builder --win nsis --x64 --publish never --config.directories.output="$STAGING_DIR"
    printf '%s\n' 'Building macOS Apple Silicon installer...'
    npx electron-builder --mac dmg --arm64 --publish never --config.directories.output="$STAGING_DIR"
    printf '%s\n' 'Building macOS Intel x64 installer...'
    npx electron-builder --mac dmg --x64 --publish never --config.directories.output="$STAGING_DIR"
    printf '%s\n' 'Building Linux x64 installer...'
    npx electron-builder --linux deb --x64 --publish never --config.directories.output="$STAGING_DIR"
    ;;
esac

publish_installers
show_artifacts
