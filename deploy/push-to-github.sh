#!/usr/bin/env bash
# ============================================================================
# رفع المشروع إلى GitHub — Linux / macOS / WSL
#
#   ./deploy/push-to-github.sh <github-user> [repo] [branch]
#
# مثال:
#   ./deploy/push-to-github.sh amrnz ai-translator main
# ============================================================================
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_DIR}"

GITHUB_USER="${1:-}"
REPO="${2:-ai-translator}"
BRANCH="${3:-main}"
MESSAGE="${COMMIT_MESSAGE:-المترجم الصوتي والسياقي الذكي: نسخة أولى كاملة}"

log()  { printf '\033[1;34m[git]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[git]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[git]\033[0m %s\n' "$*" >&2; exit 1; }

[[ -n "${GITHUB_USER}" ]] || die "الاستخدام: ./deploy/push-to-github.sh <github-user> [repo] [branch]"
command -v git >/dev/null 2>&1 || die "git غير مثبّت."

REMOTE_URL="https://github.com/${GITHUB_USER}/${REPO}.git"

# ------------------------------------------------------------------- الهوية
git config --global user.name  >/dev/null 2>&1 || die 'اضبط اسمك: git config --global user.name "اسمك"'
git config --global user.email >/dev/null 2>&1 || die 'اضبط بريدك: git config --global user.email "you@example.com"'
log "الهوية: $(git config --global user.name) <$(git config --global user.email)>"

# ------------------------------------------------------- تهيئة المستودع
if [[ ! -d .git ]]; then
  log 'تهيئة مستودع Git جديد...'
  git init -b "${BRANCH}" >/dev/null
else
  log 'المستودع موجود مسبقًا.'
fi

# --------------------------------------------------- التحقق من الأسرار
if [[ -f .env ]]; then
  if git check-ignore -q .env; then
    log 'ملف .env موجود ومُستثنى من Git. ✅'
  else
    die '.env غير مُستثنى! أصلح .gitignore قبل الدفع.'
  fi
fi
if find . -name '.env.*' -not -name '.env.example' -not -path './node_modules/*' -print -quit | grep -q .; then
  warn 'توجد ملفات بيئة إضافية محليًا — تأكد أنها مُستثناة.'
fi

# ------------------------------------------------------------ الإضافة
log 'إضافة الملفات...'
git add -A

STAGED="$(git diff --cached --name-only | wc -l | tr -d ' ')"
log "عدد الملفات المُدرجة: ${STAGED}"

if [[ "${STAGED}" != "0" ]]; then
  git -c core.safecrlf=false commit -m "${MESSAGE}" >/dev/null
  log 'تم إنشاء الالتزام.'
else
  log 'لا تغييرات جديدة.'
fi
git branch -M "${BRANCH}"

# ------------------------------------------------------------- الـ remote
if git remote | grep -qx origin; then
  CURRENT="$(git remote get-url origin)"
  if [[ "${CURRENT}" != "${REMOTE_URL}" ]]; then
    log "تحديث remote من ${CURRENT} إلى ${REMOTE_URL}"
    git remote set-url origin "${REMOTE_URL}"
  fi
else
  log "إضافة remote: ${REMOTE_URL}"
  git remote add origin "${REMOTE_URL}"
fi

# ---------------------------------------------------------------- الدفع
log "الدفع إلى origin/${BRANCH} ..."
if ! git push -u origin "${BRANCH}"; then
  cat <<EOT

فشل الدفع. تحقّق من:
  1) هل أنشأت المستودع الفارغ؟ https://github.com/new  (الاسم: ${REPO})
  2) المصادقة: استخدم Personal Access Token بدل كلمة المرور،
     أو SSH:  git remote set-url origin git@github.com:${GITHUB_USER}/${REPO}.git
EOT
  exit 1
fi

log '✅ تم الرفع بنجاح.'
cat <<EOT

الخطوة التالية:
  1) https://github.com/${GITHUB_USER}/${REPO}/actions
     انتظر مهمة build-and-publish لتبني صورة amd64+arm64 على ghcr.io
  2) على السيرفر:
     git clone https://github.com/${GITHUB_USER}/${REPO}.git && cd ${REPO}
     cp deploy/.env.deploy.example .env    # ثم حرّره
     sed -i 's#^APP_IMAGE=.*#APP_IMAGE=ghcr.io/${GITHUB_USER}/${REPO}:latest#' .env
     chmod +x deploy/deploy.sh && ./deploy/deploy.sh --pull
EOT
