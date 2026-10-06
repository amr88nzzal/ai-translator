# دليل النشر: GitHub ← صورة Docker (amd64/arm64) ← سيرفر ARM64 ← Cloudflare Tunnel

هذا الدليل يشرح المسار الكامل الذي طلبته، بترتيب التنفيذ، مع أوامر جاهزة للنسخ.
الخادم المستهدف: **سيرفر ARM64** (مثل Oracle Cloud Ampere، Hetzner CAX، Raspberry Pi 4/5)
بنظام Debian/Ubuntu، ودومين مُدار على **Cloudflare** موصول عبر **نفق Cloudflare**.

```
GitHub (المستودع)
      │  push  →  GitHub Actions
      ▼
ghcr.io/<user>/ai-translator:latest   ← صورة متعددة المعماريات (linux/amd64 + linux/arm64)
      │  docker compose pull
      ▼
سيرفر ARM64
   ┌──────────────────────────────────────────┐
   │  cloudflared ──(شبكة edge)──► app:3500   │
   └──────────────────────────────────────────┘
      ▲
      │ نفق صادر فقط (لا منافذ مفتوحة، لا شهادة TLS محلية)
   Cloudflare Edge ──HTTPS──► المستخدمون
```

> ### لماذا النفق إلزامي مع المنفذ 3500؟
>
> Cloudflare لا يتصل بالأصل إلا على منافذ محددة ([توثيق المنافذ](https://developers.cloudflare.com/fundamentals/reference/network-ports/)):
> **HTTP:** 80 · 8080 · 8880 · 2052 · 2082 · 2086 · 2095 — **HTTPS:** 443 · 2053 · 2083 · 2087 · 2096 · 8443.
>
> المنفذ **3500 ليس ضمنها**، لذا A record يشير إلى IP سيرفرك **لن يعمل**. الطريقان اللذان يعملان:
>
> 1. **النفق (المستخدم هنا):** الدومين الفرعي → `app:3500` داخل شبكة Docker. لا منافذ مفتوحة، TLS مجاني، ولا كشف لـ IP السيرفر. ✅
> 2. إطفاء بروكسي Cloudflare (سحابة رمادية) على الدومين الفرعي: يعمل مع أي منفذ، لكنه يكشف IP سيرفرك مباشرة ويلغي حماية DDoS، ويحتاج شهادة TLS على السيرفر نفسه. ⚠️
>
> ملاحظة: الزائر يستخدم `https://sub.example.com` بلا رقم منفذ؛ الرقم 3500 داخلي بين النفق والتطبيق.

---

## 1) رفع المشروع إلى GitHub

### 1.1 تجهيز Git (مرة واحدة على جهازك)

```powershell
git config --global user.name "اسمك"
git config --global user.email "you@example.com"
git config --global credential.helper manager   # يفتح المتصفح مرة واحدة للمصادقة
```

### 1.2 إنشاء المستودع الفارغ

افتح <https://github.com/new>، الاسم: **ai-translator**، واختر **Public** أو **Private**،
ولا تُضف README ولا .gitignore (المشروع يحتويهما).

> إذا فضّلت Private، فسيحتاج السيرفر إلى تسجيل دخول إلى ghcr.io (القسم 3.3).

### 1.3 الدفع من جهازك

```powershell
cd C:\Users\amrnz\OneDrive\Documents\deepseek-harness\default-workspace\smart-translator-pwa
.\deploy\push-to-github.ps1 -User YOUR_GITHUB_USERNAME -Repo ai-translator
```

على Linux/macOS/WSL:

```bash
./deploy/push-to-github.sh YOUR_GITHUB_USERNAME ai-translator main
```

سكربت الدفع يتحقق تلقائيًا من أن `.env` غير مُدرج (حماية لمفتاحك)، ثم يدفع إلى `main`.
إن لم يكن Git مثبّتًا على جهازك، راجع القسم 8.

### 1.4 ما يحدث تلقائيًا بعد الدفع

مهمة GitHub Actions ([.github/workflows/docker-publish.yml](../.github/workflows/docker-publish.yml))
تنفّذ:

1. `npm ci` ثم `npm run typecheck` ثم `npm run build` — **لا تُنشر صورة إن فشل أي منها**.
2. بناء صورة Docker لمعماريتي `linux/amd64` و **`linux/arm64`** (عبر QEMU + Buildx).
3. دفعها إلى `ghcr.io/<user>/ai-translator` بوسوم: `latest` (للفرع الافتراضي)، واسم الفرع،
   واسم الوسم عند إصدار tag مثل `v1.0.0`، و`sha-<اختصار>`.

تابع التنفيذ من: `https://github.com/<user>/ai-translator/actions`

---

## 2) تجهيز سيرفر ARM64

### 2.1 التأكد من المعمارية والنظام

```bash
uname -m                 # يجب أن يظهر: aarch64
lsb_release -d 2>/dev/null || cat /etc/os-release | head -2
free -h                  # 1GB يكفي، ويُفضّل 2GB للبناء المحلي على السيرفر
df -h /                  # 5GB مساحة حرة على الأقل
```

### 2.2 تثبيت Docker + Compose

```bash
# السكربت الرسمي يدعم arm64 تلقائيًا
curl -fsSL https://get.docker.com | sudo sh

sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"     # ثم اخرج وادخل من الجلسة (أو: newgrp docker)

docker --version
docker compose version

# مهم: منصة الحاويات المطلوبة
docker buildx inspect --bootstrap | head -5
```

### 2.3 (اختياري) جدار حماية

لا يحتاج التطبيق أي منفذ مفتوح للإنترنت — النفق صادر فقط. الأفضل: لا تفتح شيئًا.

```bash
sudo ufw allow OpenSSH
sudo ufw enable
sudo ufw status           # لا وجود لـ 3500 أو 443 هنا: لا حاجة
```

---

## 3) جلب المشروع على السيرفر

### 3.1 استنساخ المستودع

```bash
sudo mkdir -p /opt && sudo chown "$USER":"$USER" /opt
cd /opt
git clone https://github.com/<user>/ai-translator.git
cd ai-translator
```

### 3.2 إنشاء ملف البيئة

```bash
cp deploy/.env.deploy.example .env
nano .env
```

في نموذج «مفتاح المستخدم» لا تحتاج مفتاح Gemini على السيرفر إطلاقًا — املأ فقط:

| المفتاح | القيمة |
| --- | --- |
| `AUTH_MODE` | `user` (الافتراضي — لا تغيّره إلا للاستخدام الداخلي) |
| `GEMINI_API_KEY` | **اتركه فارغًا** |
| `CLOUDFLARE_TUNNEL_TOKEN` | توكن النفق من القسم 4.2 |
| `APP_IMAGE` | `ghcr.io/<user>/ai-translator:latest` |

```bash
# تأكيد سريع: يجب أن يظهر AUTH_MODE=user و CLOUDFLARE_TUNNEL_TOKEN=<مضبوط>
grep -E '^(AUTH_MODE|GEMINI_API_KEY|CLOUDFLARE_TUNNEL_TOKEN|APP_IMAGE)=' .env | sed 's/\(TOKEN=\).*/\1<مضبوط>/'
```

> إن تركت `GEMINI_API_KEY` فارغًا و`AUTH_MODE=user`، فكل مستخدم سيُطلب منه مفتاحه عند أول فتح،
> ويُحفظ مشفّرًا في متصفحه. كلفتك على السيرفر تبقى استضافة فقط.

### 3.3 (فقط لو الحزمة Private) تسجيل الدخول إلى ghcr.io

أنشئ Personal Access Token بصلاحية `read:packages` من
<https://github.com/settings/tokens>، ثم على السيرفر:

```bash
echo "<TOKEN>" | docker login ghcr.io -u <user> --password-stdin
```

> لجعل الحزمة عامة: GitHub → Packages → ai-translator → Package settings → Change visibility → Public.

---

## 4) إعداد Cloudflare Tunnel (طريقة التوكن)

### 4.1 التأكد من الدومين

الدومين يجب أن يكون **مُضافًا (Active)** في حساب Cloudflare. سيُنشئ النفق سجل DNS تلقائيًا،
ولا حاجة إلى فتح أي منفذ على السيرفر.

### 4.2 إنشاء النفق ونسخ التوكن

1. لوحة Cloudflare → **Zero Trust** → **Networks** → **Tunnels** → **Create a tunnel**
2. اختر **Cloudflared** كمُوصِّل → اسم النفق: `ai-translator` → **Save tunnel**
3. اختر بيئة **Docker** وأظهر الأمر. سترى شيئًا بهذا الشكل:

   ```
   docker run cloudflare/cloudflared:latest tunnel --no-autoupdate run --token eyJhIjoi...
   ```

4. **انسخ التوكن فقط** (الجزء الطويل بعد `--token`) والصقه في `.env` مكان `CLOUDFLARE_TUNNEL_TOKEN`.

> التوكن = سر كامل. لا تضعه في Git، ولا في أي مكان عام.

### 4.3 ربط الدومين بالخدمة (Public Hostname)

داخل نفس النفق → تبويب **Public Hostname** → **Add a public hostname**:

| الحقل | القيمة |
| --- | --- |
| **Subdomain** | اتركه فارغًا للجذر، أو اكتب `translate` ليكون `translate.example.com` |
| **Domain** | نطاقك، مثل `example.com` |
| **Path** | اتركه فارغًا |
| **Type** | `HTTP` |
| **URL** | **`app:3500`** |

النقطة الجوهرية: `app` هو **اسم الخدمة داخل `compose.yaml`**، وcloudflared يصل إليه عبر
شبكة Docker الداخلية `edge`. لا تستخدم `localhost:3500` إلا إذا كان cloudflared يعمل على
المضيف نفسه خارج Docker.

احفظ. سينشئ Cloudflare سجل CNAME ويُصدر شهادة TLS تلقائيًا (Universal SSL).

---

## 5) التشغيل على السيرفر

### 5.1 الطريقة الموصى بها: سحب الصورة المبنية (سريعة على ARM64)

```bash
chmod +x deploy/deploy.sh
./deploy/deploy.sh --pull
```

### 5.2 البديل: البناء على السيرفر نفسه

```bash
docker compose build --pull      # يبني linux/arm64 محليًا (أبطأ: 5-15 دقيقة)
docker compose up -d
```

أو عبر السكربت:

```bash
./deploy/deploy.sh               # build + up + فحص صحة
```

### 5.3 التحقق

```bash
docker compose ps                                  # كلتا الخدمتين Up، وapp (healthy)

curl -s http://127.0.0.1:3500/api/health | head -c 300; echo
curl -sI https://translate.example.com | head -5   # من أي جهاز

docker compose logs --tail=30 cloudflared          # ابحث عن: CONNECTION REGISTERED
docker compose logs --tail=30 app
```

### 5.4 الفحوص التي تهم عمليًا

```bash
# 1) هل الواجهة تُقدَّم بنوع المحتوى الصحيح؟
curl -sI https://<domain>/manifest.json | grep -i content-type
#    المتوقع: application/manifest+json

curl -sI https://<domain>/sw.js | grep -iE 'content-type|service-worker-allowed'
#    المتوقع: application/javascript  +  service-worker-allowed: /

# 2) هل الأخطاء عربية بصيغة JSON (لا HTML)؟
curl -s -X POST https://<domain>/api/translate-text \
  -H 'Content-Type: application/json' -d '{"text":"","targetLang":"en"}'
#    المتوقع: {"error":{"code":"INVALID_ARGUMENT","message":"النص المطلوب ترجمته فارغ."...}}

# 3) اختبار حقيقي للترجمة (يستهلك حصة من مفتاحك)
curl -s -X POST https://<domain>/api/translate-text \
  -H 'Content-Type: application/json' \
  -d '{"text":"المريض يعاني من ألم صدري حاد","sourceLang":"ar","targetLang":"en","preset":"medical"}'
```

### 5.5 تحديث لاحق

```bash
cd /opt/ai-translator
git pull
./deploy/deploy.sh --pull
```

---

## 6) تثبيت التطبيق كـ PWA

بعد أن يعمل الدومين عبر HTTPS:

- **Android/سطح المكتب (Chrome/Edge):** ستظهر أيقونة «تثبيت» في شريط العنوان، أو من
  قائمة المتصفح → «تثبيت التطبيق». ويمكن استخدام زر 📥 داخل التطبيق للحصول على الخطوات.
- **iOS (Safari):** زر المشاركة → «إضافة إلى الشاشة الرئيسية».

شرطان أساسيان (كلاهما متحقق عبر Cloudflare):

1. **HTTPS صالح** — بدونه لا يُسجَّل عامل الخدمة ولا يُقبل التثبيت.
2. `manifest.json` بنوع `application/manifest+json` و`start_url` صحيح — تم التحقق منه في 5.4.

> لو ركّبت التطبيق على **مسار فرعي** (مثل `example.com/translate/`)، فسيلزم تعديل
> `base` في `vite.config.mjs` و`start_url`/`scope` في `client/public/manifest.json`.
> الأبسط: نطاق فرعي كامل كما في القسم 4.3.

### توصيات Cloudflare للـ PWA

- **SSL/TLS:** وضع `Full` أو `Full (strict)`. لا تستخدم `Flexible` (يسبب حلقات إعادة توجيه).
  بما أن النفق يعمل HTTP داخليًا، فـ `Full` كافٍ.
- **Caching:** لا تفعّل «Cache Everything» على `/api/*` أو `/sw.js`.
  أضف قاعدة: `URI Path starts with /api/` → **Bypass Cache**.
- **Uploads:** حد الرفع المجاني في Cloudflare هو 100 ميجابايت، والتطبيق يحد الصوت بـ 45 ميجابايت
  (وجد تزامن 3 طلبات لكل IP)، فلا مشكلة متوقعة.
- **WebSockets:** غير مستخدمة حاليًا، وأي إضافة مستقبلية ستعمل عبر النفق تلقائيًا.

---

## 7) استكشاف الأخطاء

| العَرَض | السبب المحتمل | الحل |
| --- | --- | --- |
| الصفحة تعرض 502/1033 من Cloudflare | cloudflared يعمل لكن `app` غير سليم أو الهدف خطأ | تأكد أن Public Hostname = `HTTP` + **`app:3500`** بالضبط؛ ثم `docker compose logs app` |
| `docker compose up` يقول إن التوكن فارغ | `.env` غير موجود أو التوكن لم يُملأ | `grep CLOUDFLARE_TUNNEL_TOKEN .env` ثم أعد التشغيل |
| النفق يظهر Down في اللوحة | التوكن خطأ/منتهي، أو حذفت النفق | أنشئ توكنًا جديدًا للنفق نفسه والصقه في `.env` ثم `./deploy/deploy.sh --pull` |
| `exec format error` عند التشغيل | سُحبت صورة amd64 على سيرفر ARM64 | تأكد أن Actions بنت `linux/arm64`، ثم `docker compose pull --no-cache` و `docker image inspect ghcr.io/... \| grep Architecture` |
| `Cannot find native binding` أثناء البناء داخل الحاوية | علّة npm مع التبعيات الاختيارية | أضف `--ignore-scripts` (موجود مسبقًا) وأعد `npm run build` — أو استخدم الصورة المسحوبة من ghcr.io بدل البناء المحلي |
| `/usr/bin/env: 'bash\r': No such file or directory` | نهايات أسطر CRLF في `deploy.sh` | `sudo apt install dos2unix && dos2unix deploy/deploy.sh` (و`.gitattributes` يمنع تكرارها) |
| الميكروفون لا يعمل | الصفحة ليست HTTPS أو الميكروفون مرفوض | استخدم الدومين (لا IP)، وامنح صلاحية الميكروفون في المتصفح |
| التطبيق لا يُثبَّت على iOS | ليس HTTPS صالح، أو لم يُفتح في Safari | افتح الدومين في Safari، وتأكد من SSL/TLS = Full |
| `429 RESOURCE_EXHAUSTED` | حصة مفتاح Gemini مستهلكة | انتظر، أو استخدم مفتاحًا آخر من إعدادات التطبيق، أو فعّل الفاتورة في Google AI Studio |
| الطلبات بطيئة جدًا | السيرفر ضعيف أو الشبكة | ارفع `NODE_OPTIONS=--max-old-space-size=1024` في `.env` إن توفّر 1GB+ RAM |

### أوامر تشخيص سريعة

```bash
docker compose ps
docker compose logs --tail=100 app
docker compose logs --tail=100 cloudflared
docker compose exec app node -e "fetch('http://127.0.0.1:3500/api/status').then(r=>r.json()).then(j=>console.log(j))"
docker stats --no-stream
```

---

## 8) إن لم يكن Git مثبّتًا على جهازك

1. حمّل Git for Windows من <https://git-scm.com/download/win> وثبّته (الإعدادات الافتراضية كافية).
2. أغلق طرفية DSH وافتحها من جديد (لتحديث PATH).
3. تحقق: `git --version`
4. ثم نفّذ سكربت الدفع من القسم 1.3.

بديل بدون تثبيت Git: استخدم **GitHub Desktop** (<https://desktop.github.com>) →
`File → Add local repository` واختر مجلد المشروع ثم `Publish repository`.

---

## 9) بنية ملفات النشر

| الملف | الوظيفة |
| --- | --- |
| [Dockerfile](../Dockerfile) | صورة إنتاج متعددة المراحل ومتعددة المعماريات، تعمل بمستخدم غير جذري |
| [compose.yaml](../compose.yaml) | خدمتا `app` و`cloudflared` على شبكة داخلية، مع فحص حياة واعتماديات |
| [.dockerignore](../.dockerignore) | يمنع نسخ `.env` و`node_modules` و`.git` إلى الصورة |
| [.github/workflows/docker-publish.yml](../.github/workflows/docker-publish.yml) | فحص الأنواع + بناء ونشر الصورة لـ amd64 و arm64 |
| [deploy/.env.deploy.example](.env.deploy.example) | نموذج متغيّرات بيئة السيرفر |
| [deploy/deploy.sh](deploy.sh) / [deploy.ps1](deploy.ps1) | نشر/تحديث/سجلات/حالة/إيقاف |
| [deploy/push-to-github.sh](push-to-github.sh) / [push-to-github.ps1](push-to-github.ps1) | تهيئة المستودع والدفع مع فحص الأسرار |
| [.gitattributes](../.gitattributes) | يفرض LF على السكربتات وCRLF على سكربتات Windows |
| [scripts/validate-yaml.mjs](../scripts/validate-yaml.mjs) / [validate-shell.mjs](../scripts/validate-shell.mjs) | تحقّق بنيوي من ملفات النشر عبر `npm run validate:deploy` |
