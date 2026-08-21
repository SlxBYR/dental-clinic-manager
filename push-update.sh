#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

REMOTE="${GIT_REMOTE:-origin}"
MESSAGE="chore: update app"
AUTO_YES=0

usage() {
  cat <<'EOF'
Usage:
  ./push-update.sh [commit message]
  ./push-update.sh --message "commit message" [--yes]

Options:
  -m, --message  Commit message.
  -y, --yes      Skip the final interactive confirmation.
  -h, --help     Show this help.

Environment:
  GIT_REMOTE     Remote name. Defaults to origin.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--message)
      if [[ $# -lt 2 || -z "$2" ]]; then
        echo "--message 需要一个非空提交说明。" >&2
        exit 2
      fi
      MESSAGE="$2"
      shift 2
      ;;
    -y|--yes)
      AUTO_YES=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      if [[ $# -gt 0 ]]; then
        MESSAGE="$*"
      fi
      break
      ;;
    -*)
      echo "未知参数：$1" >&2
      usage >&2
      exit 2
      ;;
    *)
      MESSAGE="$1"
      shift
      if [[ $# -gt 0 ]]; then
        echo "提交说明包含空格时请使用引号，或使用 --message。" >&2
        exit 2
      fi
      ;;
  esac
done

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "当前目录不是 Git 仓库。" >&2
  exit 1
fi

BRANCH="$(git symbolic-ref --quiet --short HEAD || true)"
if [[ -z "$BRANCH" ]]; then
  echo "当前不在分支上，无法推送。" >&2
  exit 1
fi

if ! git remote get-url "$REMOTE" >/dev/null 2>&1; then
  echo "找不到远程仓库 $REMOTE。" >&2
  exit 1
fi

if [[ -z "${MESSAGE//[[:space:]]/}" ]]; then
  echo "提交说明不能为空。" >&2
  exit 2
fi

confirm_push() {
  local answer
  if [[ "$AUTO_YES" -eq 1 ]]; then
    return 0
  fi
  if [[ ! -t 0 ]]; then
    echo "非交互环境必须添加 --yes 才会推送。" >&2
    return 1
  fi
  read -r -p "确认提交并推送到 ${REMOTE}/${BRANCH}？[y/N] " answer
  [[ "$answer" == "y" || "$answer" == "Y" ]]
}

show_unpushed_commits() {
  local remote_ref="refs/remotes/${REMOTE}/${BRANCH}"
  if git show-ref --verify --quiet "$remote_ref"; then
    git log --oneline "${REMOTE}/${BRANCH}..HEAD"
  else
    echo "远程分支 ${REMOTE}/${BRANCH} 尚无本地跟踪记录。"
  fi
}

if ! git diff --cached --quiet; then
  echo "检测到运行脚本前已经暂存的文件。为防止夹带提交，脚本已停止。" >&2
  echo "请先提交或取消暂存这些文件，再重新运行：" >&2
  git diff --cached --name-status >&2
  exit 1
fi

STAGED_BY_SCRIPT=0
cleanup_index() {
  if [[ "$STAGED_BY_SCRIPT" -eq 1 ]]; then
    git restore --staged -- . >/dev/null 2>&1 || true
  fi
}
trap cleanup_index EXIT

if [[ -z "$(git status --porcelain --untracked-files=all)" ]]; then
  echo "工作区没有需要提交的文件。"
  if [[ -z "$(show_unpushed_commits)" ]]; then
    echo "本地也没有尚未推送的提交。"
    exit 0
  fi
  echo "准备推送以下已有提交："
  show_unpushed_commits
  if ! confirm_push; then
    echo "已取消，没有推送。"
    exit 0
  fi
  git push -u "$REMOTE" "$BRANCH"
  exit 0
fi

echo "正在执行构建检查……"
npm run build

# Stage the complete repository state. .gitignore excludes dependencies,
# installers, generated output, patient backups, databases, and credentials.
git add -A
STAGED_BY_SCRIPT=1

if git diff --cached --quiet; then
  STAGED_BY_SCRIPT=0
  echo "没有可提交的文件；其余文件均已被 .gitignore 排除。"
  exit 0
fi

risky_files=()
while IFS= read -r changed_file; do
  if [[ "$changed_file" == ".env.example" || "$changed_file" == */.env.example ]]; then
    continue
  fi
  case "$changed_file" in
    .env|.env.*|*/.env|*/.env.*|*.key|*.pem|*.p12|*.pfx|*.mobileprovision|*.provisionprofile|*.sqlite|*.sqlite-*|*.db|*.db-*|dental_clinic_backup_*.json|*/dental_clinic_backup_*.json)
      risky_files+=("$changed_file")
      ;;
  esac
done < <(git diff --cached --name-only --diff-filter=ACMR)

if [[ ${#risky_files[@]} -gt 0 ]]; then
  echo "检测到可能包含患者数据、密钥或签名凭证的文件，已停止：" >&2
  printf '  %s\n' "${risky_files[@]}" >&2
  echo "请从暂存区移除并加入 .gitignore 后再重试。" >&2
  exit 1
fi

git diff --cached --check

echo
echo "即将提交的完整文件清单："
git diff --cached --name-status
echo
git diff --cached --stat
echo
echo "提交说明：$MESSAGE"

existing_unpushed="$(show_unpushed_commits)"
if [[ -n "$existing_unpushed" ]]; then
  echo
  echo "本次还会一并推送以下本地已有提交："
  printf '%s\n' "$existing_unpushed"
fi

if ! confirm_push; then
  echo "已取消，没有提交或推送；工作区文件保持不变。"
  exit 0
fi

git commit -m "$MESSAGE"
STAGED_BY_SCRIPT=0
git push -u "$REMOTE" "$BRANCH"
