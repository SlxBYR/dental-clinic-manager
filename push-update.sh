#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

REMOTE="${GIT_REMOTE:-origin}"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
MESSAGE="${1:-chore: update app}"

if [[ "$BRANCH" == "HEAD" ]]; then
  echo "当前不在分支上，无法推送。"
  exit 1
fi

if ! git remote get-url "$REMOTE" >/dev/null 2>&1; then
  echo "找不到远程仓库 $REMOTE。"
  exit 1
fi

git add -A -- . ':!release' ':!dist' ':!node_modules'

if git diff --cached --quiet; then
  echo "没有需要提交的更新。"
else
  npm run build
  git commit -m "$MESSAGE"
fi

git push -u "$REMOTE" "$BRANCH"
