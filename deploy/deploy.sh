#!/usr/bin/env bash
# ============================================================================
# المترجم الصوتي والسياقي الذكي — نشر/تحديث على سيرفر ARM64 (Debian/Ubuntu)
#
#   ./deploy/deploy.sh              # بناء محلي للنشر + تشغيل
#   ./deploy/deploy.sh --pull       # سحب الصورة من ghcr.io ثم تشغيل (بدون بناء)
#   ./deploy/deploy.sh --logs       # متابعة السجلات
#   ./deploy/deploy.sh --status     # حالة الخدمات
#   ./deploy/deploy.sh --stop       # إيقاف
# ============================================================================
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_DIR}"

COMPOSE_FILE="compose.yaml"
ENV_FILE=".env"
MODE="build"

for arg in "$@"; do
  case "${arg}" in
    --pull) MODE="pull" ;;
    --logs) MODE="logs" ;;
    --status) MODE="status" ;;
    --stop) MODE="stop" ;;
    --build) MODE="build" ;;
    -h|--help)
      sed -n '2,12p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *) echo "خيار غير معروف: ${arg}"; exit 1 ;;
  esac
done

log()  { printf '\033[1;34m[deploy]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[deploy]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[deploy]\033[0m %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- preflight

command -v docker >/dev/null 2>&1 || die "Docker غير مثبّت على هذا السيرفر."
docker compose version >/dev/null 2>&1 || die "إضافة Docker Compose غير متوفرة (docker compose version فشلت)."
docker info >/dev/null 2>&1 || die "تعذّر الاتصال بمحرّك Docker. هل المستخدم عضو في مجموعة docker؟"

if [[ ! -f "${ENV_FILE}" ]]; then
  warn "لا يوجد ملف ${ENV_FILE}. سيتم إنشاؤه من deploy/.env.deploy.example"
  cp deploy/.env.deploy.example "${ENV_FILE}"
  die "افتح ${ENV_FILE} وضع GEMINI_API_KEY و CLOUDFLARE_TUNNEL_TOKEN ثم أعد التشغيل."
fi

grep -q '^CLOUDFLARE_TUNNEL_TOKEN=.\+' "${ENV_FILE}" \
  || die "CLOUDFLARE_TUNNEL_TOKEN فارغ في ${ENV_FILE}."

# في نموذج مفتاح المستخدم لا نحتاج مفتاحًا على الخادم، لكن نطبع تذكيرًا واضحًا.
AUTH_MODE_VALUE="$(grep -E '^AUTH_MODE=' "${ENV_FILE}" | head -1 | cut -d= -f2 | tr -d '[:space:]')"
SERVER_KEY_PRESENT=0
grep -q '^GEMINI_API_KEY=.\+' "${ENV_FILE}" && SERVER_KEY_PRESENT=1

if [[ "${AUTH_MODE_VALUE:-user}" == "user" ]]; then
  log "وضع المفاتيح: user — كل مستخدم يضيف مفتاحه من داخل التطبيق."
  if [[ "${SERVER_KEY_PRESENT}" == "1" ]]; then
    warn "GEMINI_API_KEY مضبوط لكنه سيُتجاهل تمامًا في الوضع user. غيّر AUTH_MODE=hybrid إن أردت استخدامه."
  fi
else
  warn "وضع المفاتيح: hybrid — مفتاح الخادم مشترك بين كل المستخدمين (حدود Gemini على مستوى المشروع)."
  [[ "${SERVER_KEY_PRESENT}" == "1" ]] || warn "AUTH_MODE=hybrid لكن GEMINI_API_KEY فارغ: لن يعمل الوضع المختلط."
fi

# معمارية السيرفر (لتقرير أي صورة تُسحب).
ARCH="$(uname -m)"
case "${ARCH}" in
  aarch64|arm64) IMAGE_ARCH="arm64" ;;
  x86_64|amd64)  IMAGE_ARCH="amd64" ;;
  *)             IMAGE_ARCH="${ARCH}" ;;
esac

log "المعمارية المكتشفة: ${ARCH} (تُستخدم صورة linux/${IMAGE_ARCH})"

# ------------------------------------------------------------------- actions

case "${MODE}" in
  logs)
    exec docker compose -f "${COMPOSE_FILE}" logs -f --tail=200
    ;;

  status)
    docker compose -f "${COMPOSE_FILE}" ps
    echo
    log "فحص الحالة عبر المنفذ المحلي:"
    set +e
    curl -fsS "http://127.0.0.1:${APP_PORT:-3500}/api/health" && echo
    set -e
    ;;

  stop)
    log "إيقاف الخدمات..."
    docker compose -f "${COMPOSE_FILE}" down
    log "تم الإيقاف."
    ;;

  pull)
    if ! grep -q '^APP_IMAGE=ghcr.io/' "${ENV_FILE}"; then
      warn "APP_IMAGE لا يشير إلى ghcr.io — تأكد أنك سحبت اسم الصورة الصحيح في ${ENV_FILE}."
    fi
    log "سحب أحدث صورة..."
    docker compose -f "${COMPOSE_FILE}" pull
    log "تشغيل الحاويات..."
    docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans --no-build
    ;;

  build)
    log "بناء الصورة محليًا على السيرفر (قد يستغرق عدة دقائق على ARM64)..."
    docker compose -f "${COMPOSE_FILE}" build --pull
    log "تشغيل الحاويات..."
    docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans
    ;;
esac

# ---------------------------------------------------------------- post-check

if [[ "${MODE}" == "build" || "${MODE}" == "pull" ]]; then
  log "انتظار اكتمال فحص الحياة..."
  HEALTHY=0
  for _ in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:${APP_PORT:-3500}/api/health" >/dev/null 2>&1; then
      HEALTHY=1
      break
    fi
    sleep 2
  done

  echo
  docker compose -f "${COMPOSE_FILE}" ps

  if [[ "${HEALTHY}" == "1" ]]; then
    log "✅ التطبيق يعمل. فحص صحة ناجح:"
    curl -fsS "http://127.0.0.1:${APP_PORT:-3500}/api/health"; echo
  else
    warn "❌ لم ينجح فحص الحياة خلال 60 ثانية. آخر السجلات:"
    docker compose -f "${COMPOSE_FILE}" logs --tail=60
    exit 1
  fi

  echo
  log "سجلات النفق (يجب أن ترى CONNECTION REGISTERED):"
  docker compose -f "${COMPOSE_FILE}" logs --tail=25 cloudflared || true

  cat <<'EOT'

الخطوة التالية: في لوحة Cloudflare
  Zero Trust → Networks → Tunnels → نفقك → Public Hostname → Add
    Subdomain : اسم النطاق الفرعي (أو اتركه فارغًا للجذر)
    Domain    : نطاقك على Cloudflare
    Service   : HTTP  →  app:3500
EOT
fi
