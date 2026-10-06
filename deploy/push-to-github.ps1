# ============================================================================
# رفع المشروع إلى GitHub — Windows (PowerShell)
#
#   .\deploy\push-to-github.ps1 -Repo ai-translator -User YOUR_GITHUB_USERNAME
#
# يُنشئ مستودعًا محليًا (إن لم يكن موجودًا)، يضيف remote، ثم يدفع إلى main.
# لا يحتاج هذا السكربت إلى gh CLI: أنشئ المستودع الفارغ من موقع GitHub أولًا.
# ============================================================================
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$User,
    [string]$Repo = 'ai-translator',
    [string]$Branch = 'main',
    [string]$Message = 'المترجم الصوتي والسياقي الذكي: نسخة أولى كاملة',
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
Set-Location $projectDir

function Write-Step($m) { Write-Host "[git] $m" -ForegroundColor Cyan }
function Fail($m) { Write-Host "[git] $m" -ForegroundColor Red; exit 1 }

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Fail 'git غير موجود في PATH. ثبّته من https://git-scm.com/download/win ثم أعد فتح الطرفية.'
}

$remoteUrl = "https://github.com/$User/$Repo.git"

# --------------------------------------------------------------- 1) الهوية

$userName = (git config --global user.name) 2>$null
$userEmail = (git config --global user.email) 2>$null
if (-not $userName)  { Fail "اضبط اسمك أولًا: git config --global user.name ""اسمك""" }
if (-not $userEmail) { Fail "اضبط بريدك أولًا: git config --global user.email ""you@example.com""" }

# ------------------------------------------------------- 2) تهيئة المستودع

if (-not (Test-Path '.git')) {
    Write-Step 'تهيئة مستودع Git جديد...'
    git init -b $Branch | Out-Null
} else {
    Write-Step 'المستودع موجود مسبقًا، سأكمل عليه.'
}

# --------------------------------------------------- 3) التحقق من الأسرار

Write-Step 'التحقق من عدم وجود ملفات أسرار مضمّنة...'
$trackedSecrets = @()
if (Test-Path '.env') { $trackedSecrets += '.env' }
$envFiles = Get-ChildItem -Path . -Filter '.env*' -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -ne '.env.example' -and $_.FullName -notmatch '\\node_modules\\' }
foreach ($f in $envFiles) { $trackedSecrets += $f.FullName.Replace("$projectDir\", '') }

if ($trackedSecrets.Count -gt 0) {
    Write-Host 'ملفات بيئة موجودة محليًا (لن تُضاف بفضل .gitignore):' -ForegroundColor Yellow
    $trackedSecrets | ForEach-Object { Write-Host "  - $_" -ForegroundColor Yellow }
}

$ignored = git check-ignore -q .env 2>$null
if ($LASTEXITCODE -ne 0 -and (Test-Path '.env')) {
    Fail '.env ليس مُستثنى! تحقق من .gitignore قبل الدفع (يحتوي مفتاحك).'
}
Write-Step 'لا توجد أسرار ستُرفع. ✅'

# ------------------------------------------------------------ 4) الإضافة

Write-Step 'إضافة الملفات...'
git add -A

$staged = (git diff --cached --name-only | Measure-Object -Line).Lines
Write-Step "عدد الملفات المُدرجة: $staged"
if ($staged -eq 0) {
    Write-Step 'لا تغييرات جديدة للالتزام بها.'
} else {
    git -c core.safecrlf=false commit -m $Message | Out-Null
    Write-Step 'تم إنشاء الالتزام (commit).'
}
git branch -M $Branch

# ------------------------------------------------------------- 5) الـ remote

$existing = (git remote) 2>$null
if ($existing -contains 'origin') {
    $current = (git remote get-url origin) 2>$null
    if ($current -ne $remoteUrl) {
        Write-Step "تحديث remote origin من $current إلى $remoteUrl"
        git remote set-url origin $remoteUrl
    }
} else {
    Write-Step "إضافة remote: $remoteUrl"
    git remote add origin $remoteUrl
}

# ---------------------------------------------------------------- 6) الدفع

Write-Step "الدفع إلى origin/$Branch ..."
if ($Force) { git push -u origin $Branch --force } else { git push -u origin $Branch }

if ($LASTEXITCODE -ne 0) {
    Write-Host @"

فشل الدفع. الأسباب الشائعة:
  1) المستودع غير موجود على GitHub: أنشئه فارغًا (بدون README) من
     https://github.com/new  بالاسم: $Repo
  2) لم تُصادَق بعد: شغّل مرة واحدة
     git config --global credential.helper manager
     ثم أعد المحاولة وسيفتح المتصفح لتسجيل الدخول.
  3) اسم المستخدم خطأ: تحقق من https://github.com/$User
"@ -ForegroundColor Yellow
    exit 1
}

Write-Step '✅ تم الرفع بنجاح.'
Write-Host @"

الخطوة التالية:
  1) افتح https://github.com/$User/$Repo/actions
     وانتظر انتهاء مهمة build-and-publish (تبني صورة amd64+arm64).
  2) اجعل الحزمة عامة (مرة واحدة) إن أردت السحب بدون تسجيل دخول:
     GitHub → حسابك → Packages → ai-translator → Package settings → Change visibility → Public
  3) على السيرفر:
     git clone https://github.com/$User/$Repo.git && cd $Repo
     cp deploy/.env.deploy.example .env   # ثم حرّره
     sed -i 's#^APP_IMAGE=.*#APP_IMAGE=ghcr.io/$User/$Repo:latest#' .env
     chmod +x deploy/deploy.sh && ./deploy/deploy.sh --pull
"@ -ForegroundColor Green
