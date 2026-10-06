# ============================================================================
# المترجم الصوتي والسياقي الذكي — نشر على سيرفر ARM64 (PowerShell / Windows)
#
#   .\deploy\deploy.ps1              # بناء محلي + تشغيل
#   .\deploy\deploy.ps1 -Mode pull   # سحب الصورة من ghcr.io ثم تشغيل
#   .\deploy\deploy.ps1 -Mode logs   # متابعة السجلات
#   .\deploy\deploy.ps1 -Mode status # حالة الخدمات
#   .\deploy\deploy.ps1 -Mode stop   # إيقاف
# ============================================================================
[CmdletBinding()]
param(
    [ValidateSet('build', 'pull', 'logs', 'status', 'stop')]
    [string]$Mode = 'build'
)

$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
Set-Location $projectDir

$composeFile = 'compose.yaml'
$envFile = '.env'

function Write-Step($message) { Write-Host "[deploy] $message" -ForegroundColor Cyan }
function Write-Warn($message) { Write-Host "[deploy] $message" -ForegroundColor Yellow }
function Fail($message) { Write-Host "[deploy] $message" -ForegroundColor Red; exit 1 }

# ---------------------------------------------------------------- preflight

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Fail 'Docker غير مثبّت على هذا السيرفر.' }
docker compose version *> $null
if ($LASTEXITCODE -ne 0) { Fail 'إضافة Docker Compose غير متوفرة.' }

if (-not (Test-Path $envFile)) {
    Write-Warn "لا يوجد ملف $envFile — سيتم إنشاؤه من النموذج."
    Copy-Item 'deploy/.env.deploy.example' $envFile
    Fail "حرّر $envFile وضع GEMINI_API_KEY و CLOUDFLARE_TUNNEL_TOKEN ثم أعد التشغيل."
}

$envContent = Get-Content $envFile -Raw
if ($envContent -notmatch '(?m)^CLOUDFLARE_TUNNEL_TOKEN=.+') { Fail "CLOUDFLARE_TUNNEL_TOKEN فارغ في $envFile." }

# في نموذج مفتاح المستخدم لا نحتاج مفتاحًا على الخادم، لكن نطبع تذكيرًا واضحًا.
$authMode = if ($envContent -match '(?m)^AUTH_MODE=(\S+)') { $Matches[1].Trim() } else { 'user' }
$serverKeyPresent = $envContent -match '(?m)^GEMINI_API_KEY=.+'

if ($authMode -eq 'user') {
    Write-Step 'وضع المفاتيح: user — كل مستخدم يضيف مفتاحه من داخل التطبيق.'
    if ($serverKeyPresent) {
        Write-Warn 'GEMINI_API_KEY مضبوط لكنه سيُتجاهل تمامًا في الوضع user (استخدم AUTH_MODE=hybrid لتفعيله).'
    }
} else {
    Write-Warn 'وضع المفاتيح: hybrid — مفتاح الخادم مشترك بين كل المستخدمين (حدود Gemini على مستوى المشروع).'
    if (-not $serverKeyPresent) { Write-Warn 'AUTH_MODE=hybrid لكن GEMINI_API_KEY فارغ: لن يعمل الوضع المختلط.' }
}

$appPort = if ($envContent -match '(?m)^APP_PORT=(\d+)') { $Matches[1] } else { '3500' }
Write-Step "منفذ الفحص المحلي: $appPort"

# ------------------------------------------------------------------- actions

switch ($Mode) {
    'logs' {
        docker compose -f $composeFile logs -f --tail=200
        exit 0
    }
    'status' {
        docker compose -f $composeFile ps
        Write-Step 'فحص الحالة:'
        try { (Invoke-WebRequest "http://127.0.0.1:$appPort/api/health" -UseBasicParsing).Content } catch { Write-Warn "فشل الفحص: $($_.Exception.Message)" }
        exit 0
    }
    'stop' {
        Write-Step 'إيقاف الخدمات...'
        docker compose -f $composeFile down
        Write-Step 'تم الإيقاف.'
        exit 0
    }
    'pull' {
        Write-Step 'سحب أحدث صورة...'
        docker compose -f $composeFile pull
        Write-Step 'تشغيل الحاويات...'
        docker compose -f $composeFile up -d --remove-orphans --no-build
    }
    'build' {
        Write-Step 'بناء الصورة محليًا...'
        docker compose -f $composeFile build --pull
        Write-Step 'تشغيل الحاويات...'
        docker compose -f $composeFile up -d --remove-orphans
    }
}

# ---------------------------------------------------------------- post-check

Write-Step 'انتظار اكتمال فحص الحياة...'
$healthy = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        $response = Invoke-WebRequest "http://127.0.0.1:$appPort/api/health" -UseBasicParsing -TimeoutSec 5
        if ($response.StatusCode -eq 200) { $healthy = $true; break }
    } catch { Start-Sleep -Seconds 2 }
}

Write-Host ''
docker compose -f $composeFile ps

if ($healthy) {
    Write-Step '✅ التطبيق يعمل. فحص صحة ناجح:'
    (Invoke-WebRequest "http://127.0.0.1:$appPort/api/health" -UseBasicParsing).Content
    Write-Host ''
    Write-Step 'سجلات النفق (ابحث عن CONNECTION REGISTERED):'
    docker compose -f $composeFile logs --tail=25 cloudflared
} else {
    Write-Warn '❌ لم ينجح فحص الحياة خلال 60 ثانية. آخر السجلات:'
    docker compose -f $composeFile logs --tail=60
    exit 1
}

@'

الخطوة التالية: في لوحة Cloudflare
  Zero Trust → Networks → Tunnels → نفقك → Public Hostname → Add
    Subdomain : اسم النطاق الفرعي (أو اتركه فارغًا للجذر)
    Domain    : نطاقك على Cloudflare
    Service   : HTTP  →  app:3500
'@ | Write-Host
