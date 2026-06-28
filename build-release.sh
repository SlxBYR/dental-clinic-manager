#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

echo "==> Generating app icons"
python3 scripts/generate-rounded-icon.py

echo "==> Building frontend"
npm run build

echo "==> Building macOS arm64 DMG"
npx electron-builder --mac dmg --arm64

echo "==> Building Windows x64 EXE packages"
npx electron-builder --win nsis portable --x64

echo
echo "Done."
echo "macOS arm64 DMG: release/DentalSystem-0.0.2-arm64.dmg"
echo "Windows x64 installer: release/DentalSystem Setup 0.0.2.exe"
echo "Windows x64 portable: release/DentalSystem 0.0.2.exe"
