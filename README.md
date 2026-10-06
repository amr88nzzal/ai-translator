# المترجم الصوتي والسياقي الذكي

**Smart Contextual Voice & Text Translator** — تطبيق ويب تقدّمي (PWA قابل للتثبيت) للترجمة الفورية
ثنائية اللغة (عربي RTL / إنجليزي LTR) مدعوم بالذكاء الاصطناعي متعدد الوسائط من Google Gemini،
مع فهم سياقي للمجال والنبرة، واستخراج المصطلحات التخصصية، ونمط بث مباشر للمحادثات والمحاضرات.

---

## 1. أبرز المزايا

### الترجمة
- **ترجمة صوتية متعددة الوسائط**: يُرسل المقطع الصوتي الخام (Base64) مباشرة إلى Gemini دون خطوة
  تحويل صوت إلى نص منفصلة، ما يقلّل زمن الاستجابة ويحفظ النبرة والانفعال.
- **مخرجات منظّمة صارمة** عبر `responseSchema`:
  `transcription` · `translation` · `detectedLanguage` · `contextAnalysis` · `keyTerms[{term, translation, note}]`.
- **سياق المجال**: عام، طبي، برمجي/تقني، قانوني، أعمال، محادثة، سياحة، أكاديمي.
- **النبرة**: مهنية، عفوية، أكاديمية، موجزة.
- **تعليمات مخصّصة**: حقل حر (مثال: «ترجم كتقرير طوارئ عاجل»).
- **قاعدة صريحة في التعليمات**: ممنوع الترجمة الحرفية كلمة بكلمة؛ تُكيَّف التعبيرات الاصطلاحية
  وتُحفظ مصطلحات المجال مع شرحها.

### التسجيل الصوتي — ثلاثة أنماط
| النمط | السلوك |
| --- | --- |
| **تشغيل/إيقاف (Toggle)** | اضغط للبدء، واضغط مرة أخرى للإيقاف والترجمة. |
| **اضغط واستمر (Push-to-Hold)** | استمر بالضغط أثناء الكلام، واتركه للإرسال الفوري. |
| **بث مباشر (Continuous)** | مستمع مستمر يقطّع الكلام تلقائيًا عند السكوت (VAD) إلى مقاطع متتالية، مع سقف زمني لكل مقطع. |

مع مؤشر موجات صوتية حقيقي (Web Audio `AnalyserNode` + `requestAnimationFrame`)، حلقة نابضة أثناء
التسجيل، مؤقّت زمني، اختيار الميكروفون، ورفع ملف صوتي جاهز.

### الواجهة والتجربة
- **RTL-first** مع تبديل سلس إلى LTR بحسب لغة النص/الواجهة، وخطوط Cairo و Plus Jakarta Sans.
- **وضعان فاتح وداكن** + خيار «حسب النظام»، بتشكيل Slate/Indigo زجاجي.
- **بطاقة النتيجة**: النص المصدر والترجمة جنبًا إلى جنب، نطق فوري (TTS بسرعات 0.7x–1.4x واختيار صوت)،
  نسخ، مفضلة، مشاركة.
- **شبكة المصطلحات (Glossary Cards)** و**بطاقة السياق** التي تشرح كيف أثّر السياق على الاختيارات.
- **عرض البث المباشر**: مقاطع متتالية بحالات (`processing` / `completed` / `error`)، تمرير تلقائي،
  إعادة تشغيل الصوت، إعادة المحاولة، ونسخ كل مقطع.
- **سجل الترجمات**: لغة جانبية قابلة للبحث، مرشّح المفضلة والمجال، تصدير JSON/نصي، وتصفير.
- **مسرد موحّد** يجمّع المصطلحات المتكررة عبر كل الجلسات مع عدّاد تكرار وفرز.
- **إعدادات شاملة**: المفتاح، حساسية VAD، النمط الافتراضي، النبرة الافتراضية، سرعة النطق، الصوت المفضّل،
  حد السجل، وإعادة التصفير.

### PWA وجاهزية الجوال
- `manifest.json` بـ `display: standalone` و`theme_color: #4f46e5` و`background_color: #0f172a`
  وأيقونات 192/512 وmaskable واختصارات سريعة ولقطات شاشة.
- عامل خدمة (`sw.js`) يخزّن هيكل التطبيق، ويقدّم صفحة `offline.html` عند انقطاع الشبكة،
  ويحتوي على خطّاف Background Sync لإعادة المحاولة.
- **دليل تثبيت داخل التطبيق** يتعرّف على iOS (المشاركة → إضافة إلى الشاشة الرئيسية) وAndroid/سطح المكتب
  (`beforeinstallprompt`) مع خطوات تغليف APK عبر PWABuilder.

---

## 2. المعمارية

```
smart-translator-pwa/
├─ client/                     # واجهة React 19 + Vite (RTL-first)
│  ├─ index.html               # القشرة: manifest، الأيقونات، الخطوط
│  ├─ public/                  # manifest.json، sw.js، offline.html، الأيقونات
│  └─ src/
│     ├─ App.tsx               # منسّق الحالة الكامل (ترجمة، سجل، مسرد، بث)
│     ├─ components/           # مكوّنات الواجهة (تسجيل، نتائج، سجل، إعدادات…)
│     ├─ hooks/                # useRecorder (المحرّك الصوتي)، useSpeech، useToasts…
│     ├─ lib/                  # api.ts، storage.ts، utils.ts
│     ├─ constants.ts          # اللغات، المجالات، النبرات، الافتراضيات
│     └─ types.ts              # كل أنواع العميل (strict)
├─ server/                     # Express 5 + وسيط Vite
│  ├─ app.ts                   # المسارات، أصول PWA، وسيط الأخطاء العربي
│  ├─ start.ts                 # إقلاع الإنتاج (يُحزَّم إلى dist/server.cjs)
│  ├─ dev.ts                   # إقلاع التطوير مع وسيط Vite (dist/dev.cjs)
│  ├─ gemini.ts                # محرّك Gemini: إعادة المحاولة، تعاقب الموديلات، المفاتيح
│  ├─ prompt.ts                # هندسة التعليمات (المجال + النبرة + القواعد)
│  ├─ errors.ts · config.ts · logger.ts · runtime.ts
├─ shared/api-contract.ts      # العقد المشترك بين الخادم والعميل
├─ scripts/                    # build-client.mjs، build-server.mjs، vite-realpath-patch.mjs، generate-icons.py
├─ vite.config.mjs             # إعداد Vite المشترك (يستورده سكربت البناء)
├─ dist/                       # المخرجات: dist/client + dist/server.cjs + dist/dev.cjs
├─ Dockerfile                  # نشر Cloud Run / Docker
└─ docs/component-contract.md  # عقد مكوّنات الواجهة
```

### التشغيل
- **التطوير**: Express يدمج Vite في وضع الوسيط (HMR) — خادم واحد للمسارات والواجهة.
- **الإنتاج**: `vite build` → `dist/client`، و`esbuild` → `dist/server.cjs` (صيغة CJS آمنة على
  Cloud Run دون الاعتماد على `import.meta.url`).

---

## 3. محرّك Gemini وعوامل الصمود

1. **إعادة المحاولة مع تراجع أُسّي** (`GEMINI_MAX_ATTEMPTS`، `GEMINI_BACKOFF_BASE_MS`) لامتصاص
   موجات `503 Unavailable / High Demand` و`429`.
2. **تعاقب الموديلات** بالترتيب الافتراضي:
   `gemini-3.8-flash` → `gemini-3.1-flash-lite` → `gemini-flash-latest` → `gemini-3.6-flash`
   (قابل للتجاوز بـ `GEMINI_MODELS`).
3. **مصدر المفتاح**: `AUTH_MODE=user` (الافتراضي) يستخدم **مفتاح المستخدم فقط** ويتجاهل أي مفتاح على
   الخادم؛ و`AUTH_MODE=hybrid` يعطي الأولوية لمفتاح المستخدم ثم يرجع إلى مفتاح الخادم.
   في الحالتين يُتحقّق من الصيغة (`AIza…`) ويُرفض أي رمز OAuth مؤقت (`ya29…`).
4. **حماية الخادم**: سقف تزامن (3 طلبات للمستخدم) وسقف ساعي لكل IP
   (`MAX_REQUESTS_PER_IP_PER_HOUR`، الافتراضي 600) — يحميان السيرفر من الإساءة في نموذج BYOK.
5. **أخطاء عربية منظّمة** فقط (`UNAUTHENTICATED`, `RESOURCE_EXHAUSTED`, `PAYLOAD_TOO_LARGE`,
   `UNAVAILABLE`, `EMPTY_AUDIO`, `INVALID_ARGUMENT`, `MODEL_NOT_FOUND`, `INTERNAL`) — لا يوجد أي
   تسريب لصفحة HTML أو أثر برمجي إلى المتصفح.

كل الردود على `/api/*` بالشكل `{ ok: true, data, meta }` أو `{ error: { code, message, retryable } }`.

---

## 4. التشغيل المحلي

### المتطلبات
- **Node.js 20.19+ أو 22.12+** — شرط Vite 8 لتشغيل الواجهة والبناء.
  (خادم الإنتاج `dist/server.cjs` يعمل على Node 20.0+، لكن البناء يحتاج الإصدار الأحدث.)
- `npm` (مُختبر) أو `pnpm` — كلاهما مدعوم.

### الخطوات
```bash
# 1) التبعيات
npm install

# 2) الإعدادات (لا تحتاج مفتاحًا على السيرفر)
copy .env.example .env      # ويندوز
# cp .env.example .env      # ماك/لينكس
# اترك AUTH_MODE=user و GEMINI_API_KEY فارغًا

# 3) التطوير (خادم + واجهة على منفذ واحد)
npm run dev          # ثم افتح http://localhost:3500
```

> **نموذج المفاتيح:** التطبيق يعمل بمفتاح **كل مستخدم على حدة** (`AUTH_MODE=user` الافتراضي).
> عند أول فتح تظهر شاشة تطلب المفتاح مع رابط مباشر إلى Google AI Studio، ويُحفظ المفتاح
> **مشفّرًا (AES-GCM)** في متصفح المستخدم — ولا يُدرج أبدًا في حِزَم العميل ولا في سجلات الخادم.
>
> للاستخدام الداخلي فقط يمكن تفعيل مفتاح احتياطي مشترك عبر `AUTH_MODE=hybrid` و`GEMINI_API_KEY`.
> لا يُنصح بذلك لنشر عام: حدود Gemini تُطبَّق على مستوى **المشروع** لا المفتاح، فيتقاسم كل
> المستخدمين حصة واحدة.

### البناء للإنتاج
```bash
npm run build        # dist/client + dist/server.cjs + dist/dev.cjs
npm start            # يشغّل الخادم على PORT (الافتراضي 3500)
```

### الأوامر
| الأمر | الوظيفة |
| --- | --- |
| `npm run dev` | تشغيل الخادم مع Vite وHMR (منفذ 3500). |
| `npm run typecheck` | تحقّق TypeScript صارم بلا إخراج ملفات. |
| `npm run build` | بناء الواجهة ثم حزم الخادم. |
| `npm start` | تشغيل نسخة الإنتاج من `dist/server.cjs`. |
| `npm run icons` | إعادة توليد أيقونات PWA بلغة Python + Pillow. |
| `npm run validate:deploy` | تحقّق بنيوي من `compose.yaml` وسكربتات النشر (سطور، heredocs، توازن الكتل). |

### ملاحظات بيئة (Windows المُقيَّد / OneDrive)

المشروع مبني ليعمل أيضًا على أجهزة Windows مقيّدة الصلاحيات (بيئات CI، صور الشركات، صناديق الحماية)
دون أي تعديل يدوي:

- **تخطيط التبعيات**: يُفضّل تخطيط `node_modules` مسطّح (npm، أو `node-linker: hoisted` في pnpm)، لأن
  Node لا يتتبّع اختصارات pnpm (junctions) بثبات على ويندوز داخل مجلدات OneDrive. التفاصيل في
  `pnpm-workspace.yaml`.
- **بناء الواجهة** يمر عبر `scripts/build-client.mjs` الذي يطبّق تعديلًا صغيرًا على Vite قبل تحميله:
  يمنع Vite من تنفيذ `net use` (استدعاء عملية فرعية قد يُرفض بـ `EPERM` على الأجهزة المقيّدة) دون أي
  تغيير في ناتج البناء. راجع `scripts/vite-realpath-patch.mjs`.
- **حزم الخادم** تتم بأداة esbuild عبر سطر الأوامر. توجد نسخة بديلة تستخدم واجهة esbuild البرمجية:
  `npm run build:server:api` (تحتاج السماح بتشغيل عملية فرعية).
- إذا ظهر الخطأ `Cannot find native binding` من `rolldown` بعد التثبيت (علّة معروفة في npm مع
  التبعيات الاختيارية)، أعد التثبيت:
  `npm install --no-save @rolldown/binding-win32-x64-msvc@1.2.12`.

---

## 5. متغيّرات البيئة

| المتغيّر | الافتراضي | الوصف |
| --- | --- | --- |
| `GEMINI_API_KEY` | — | مفتاح الخادم (لا يصل إلى المتصفح إطلاقًا). |
| `GEMINI_MODELS` | السلسلة أعلاه | ترتيب الموديلات البديلة، مفصولة بفواصل. |
| `GEMINI_MAX_ATTEMPTS` | `3` | محاولات الإعادة لكل موديل عند الازدحام. |
| `GEMINI_BACKOFF_BASE_MS` | `600` | أساس التراجع الأُسّي. |
| `GEMINI_BACKOFF_MAX_MS` | `6000` | سقف التراجع. |
| `GEMINI_TIMEOUT_MS` | `115000` | مهلة الطلب الواحد إلى Gemini. |
| `PORT` / `HOST` | `3500` / `0.0.0.0` | منفذ وعنوان الاستماع. |
| `AUTH_MODE` | `user` | `user` = مفتاح كل مستخدم إلزامي (مفتاح الخادم مُتجاهل) · `hybrid` = مفتاح خادم احتياطي. |
| `MAX_REQUESTS_PER_IP_PER_HOUR` | `600` | سقف ساعي لكل IP لحماية الخادم (0 = بلا سقف). |
| `NODE_ENV` | `development` | يُضبط تلقائيًا في حزمة الإنتاج؛ يظهر في السجلات فقط. |
| `APP_VERSION` | `1.0.0` | يظهر في `/api/status`. |

> **المنفذ 3500:** هو المنفذ المعتمد في المشروع (الخادم، الحاوية، و`APP_PORT`).
> غيّره في مكان واحد إن أردت: `PORT` في `.env` (داخل الحاوية) و`APP_PORT` (على المضيف)،
> مع تعديل المنفذ في `compose.yaml` وأمر `--port` في سكربتات Vite إن لزم.
> تنبيه: لو ربطت الدومين عبر **A record مباشر** بدل النفق، فتذكّر أن Cloudflare لا يتصل
> إلا بمنافذ محددة (80/8080/8880/2052/2082/2086/2095 و 443/2053/2083/2087/2096/8443)
> — و**3500 ليس منها**. راجع [deploy/README.md](deploy/README.md).

---

## 6. واجهات الـ API

| المسار | الوصف |
| --- | --- |
| `GET /api/health` | فحص صحة بسيط (لاستخدام Cloud Run). |
| `GET /api/status` | حالة الخادم، وجود مفتاح، سلسلة الموديلات، الحدود. |
| `POST /api/validate-key` | تحقّق حقيقي من مفتاح (أرسل `apiKey: "env"` لفحص مفتاح الخادم). |
| `POST /api/translate-text` | ترجمة نصية سياقية منظّمة. |
| `POST /api/translate-audio` | ترجمة صوتية متعددة الوسائط (Base64). |
| `GET /manifest.json` · `GET /sw.js` · `GET /offline.html` | أصول PWA بأنواع MIME صحيحة. |

مثال:
```bash
curl -X POST http://localhost:3500/api/translate-text \
  -H "Content-Type: application/json" \
  -d '{"text":"المريض يعاني من ألم صدري حاد","sourceLang":"ar","targetLang":"en","preset":"medical","tone":"professional"}'
```

الحدود: جسم الطلب حتى **50MB**، ملف صوتي حتى **45MB**، نص حتى **40,000** حرف، وحد تزامن 3 طلبات لكل IP.

---

## 7. النشر على سيرفر ARM64 عبر Docker + Cloudflare Tunnel

المسار الكامل (GitHub ← صورة متعددة المعماريات ← سيرفر ARM64 ← نفق Cloudflare) موثّق خطوة بخطوة في
**[deploy/README.md](deploy/README.md)**. الملخّص:

```bash
# 1) على جهازك: ارفع المشروع إلى GitHub (يتحقق من عدم رفع .env)
#    ويندوز:
.\deploy\push-to-github.ps1 -User YOUR_USERNAME -Repo ai-translator
#    لينكس/ماك:
./deploy/push-to-github.sh YOUR_USERNAME ai-translator main

# 2) GitHub Actions يبني تلقائيًا صورة linux/amd64 + linux/arm64 على ghcr.io

# 3) على السيرفر ARM64
git clone https://github.com/YOUR_USERNAME/ai-translator.git && cd ai-translator
cp deploy/.env.deploy.example .env     # ضع GEMINI_API_KEY و CLOUDFLARE_TUNNEL_TOKEN
sed -i 's#^APP_IMAGE=.*#APP_IMAGE=ghcr.io/YOUR_USERNAME/ai-translator:latest#' .env
chmod +x deploy/deploy.sh && ./deploy/deploy.sh --pull
```

في لوحة Cloudflare: `Zero Trust → Networks → Tunnels → Public Hostname → Add`
بخدمة `HTTP` وهدف **`app:3500`** (اسم خدمة Docker، لا `localhost`).
لا يُفتح أي منفذ للإنترنت: كل الوصول يمر عبر النفق الصادر، وTLS يُصدره Cloudflare تلقائيًا
وهو شرط تثبيت الـ PWA.

يتوفّر أيضًا `compose.yaml` جاهز (خدمتا `app` و`cloudflared` على شبكة داخلية، فحص حياة،
وإعادة تشغيل تلقائية)، و`Dockerfile` متعدد المراحل يعمل بمستخدم غير جذري.
سكربتات النشر: `deploy/deploy.sh` (لينكس) و`deploy/deploy.ps1` (ويندوز) تدعم
`--pull` و`--build` و`--logs` و`--status` و`--stop`، وتتحقق تلقائيًا من متغيّرات البيئة قبل التشغيل.

### بديل: Google Cloud Run

```bash
gcloud run deploy smart-translator \
  --source . \
  --region=me-central1 \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY="AIza..."
```

نقاط مهمة: التطبيق يستخدم `PORT` تلقائيًا، ولا يعتمد على أي حالة قرص، و`/api/health` مناسبة لفحص الحياة.
لتثبيت الـ PWA على الجوال يجب أن يُقدَّم التطبيق عبر **HTTPS** (Cloud Run وCloudflare يوفّران ذلك).

---

## 8. الأمان والخصوصية

نموذج التشغيل هو **مفتاح المستخدم (BYOK)**، وهذا يحدّد ما نحميه وما لا يمكن حمايته:

- **الخادم لا يحتفظ بأي مفتاح** في الوضع الافتراضي (`AUTH_MODE=user`)، ولا يظهر أي مفتاح في حِزَم
  العميل ولا في سجلات الخادم (السجلات تذكر مصدر المفتاح `user`/`server` فقط دون أي مادة مفتاحية).
- **مفتاح المستخدم يُحفظ مشفّرًا** بخوارزمية AES-GCM في متصفحه، ومفتاح التشفير مشتق من أصل الموقع —
  أي أن المفتاح لا يُكتب نصًا صريحًا في `localStorage` ولا يمكن قراءته من نسخة ملفات المتصفح.
- **حدود صريحة**: لا يوجد تخزين آمن مطلق في المتصفح. أي إضافة أو هجوم XSS داخل الصفحة قد يصل إلى
  المفتاح أثناء الاستخدام؛ ولذلك نُبلّغ المستخدم بذلك في شاشة البداية والإعدادات، ونوفّر زر حذف فوري.
- **تقليل سطح الهجوم**: المفتاح لا يُرسل إلا إلى خادم التطبيق ثم إلى Google عبر HTTPS، والصيغة
  تُتحقّق قبل أي طلب، والسقف الساعي لكل IP + سقف التزامن يحميان السيرفر من الإساءة.
- الصوت يُرسل إلى Gemini للترجمة، بينما يبقى السجل والمسرد على جهاز المستخدم.
- معالجة أخطاء موحّدة بالعربية، وتراجع آمن في حال رفض صلاحية الميكروفون أو انقطاع الشبكة أو ملف صوتي فارغ.

## 9. التوثيق الداخلي
- `docs/component-contract.md` — عقد مكوّنات الواجهة (الخصائص والسلوك) بالعربية.

---

## 10. ما تم التحقق منه فعليًا

| الفحص | النتيجة |
| --- | --- |
| `npm run typecheck` (TypeScript صارم مع `noUnusedLocals`/`noUnusedParameters`) | ✅ بلا أخطاء |
| بناء الواجهة (`vite build`) | ✅ 2333 وحدة → `dist/client` (JS ‎549 kB ≈ 162 kB مضغوط، CSS ‎87 kB ≈ 14 kB مضغوط) |
| حزم الخادم (`esbuild`) | ✅ `dist/server.cjs` و`dist/dev.cjs` (≈ 91 kB لكل منهما) |
| تشغيل نسخة الإنتاج فعليًا | ✅ الخادم يقلع ويخدم الواجهة والمسارات |
| `GET /api/health` · `/api/status` | ✅ 200 مع JSON وبصمة زمنية |
| `GET /manifest.json` | ✅ `application/manifest+json; charset=utf-8` |
| `GET /sw.js` | ✅ `application/javascript; charset=utf-8` + `Service-Worker-Allowed: /` |
| `GET /offline.html` | ✅ `text/html; charset=utf-8` |
| `GET /` ومسار عميق (`/some/deep/route`) | ✅ سقوط SPA إلى `index.html` |
| `POST /api/translate-text` بمدخل ناقص | ✅ 400 برسالة عربية (`INVALID_ARGUMENT`) |
| `POST /api/translate-text` بلا مفتاح | ✅ 401 برسالة عربية (`UNAUTHENTICATED`) |
| `POST /api/translate-audio` بلا صوت / ملف صغير | ✅ 422 (`EMPTY_AUDIO`) |
| `POST /api/translate-audio` بصيغة غير مدعومة | ✅ 400 مع قائمة الصيغ المدعومة |
| `POST /api/validate-key` برمز OAuth `ya29…` | ✅ رفض واضح برسالة عربية |
| `POST /api/validate-key` بصيغة غير صحيحة | ✅ رفض فوري (تحقق صيغة، دون شبكة) |
| مسار `/api` غير موجود | ✅ 404 بـ JSON (لا HTML) |
| **استدعاء Gemini حقيقي** بمفتاح تالف الصلاحية | ✅ وصل الطلب إلى Google وعاد الخطأ وصُنّف بدقة (`api_key_invalid` → 401 برسالة عربية، خلال 0.4 ثانية) |
| **فرض نموذج BYOK** (مع وجود مفتاح خادم وهمي في البيئة) | ✅ `/api/status` يعلن `authMode: user` و`serverKeyConfigured: false`، والترجمة بلا مفتاح ترجع 401 ولا يُستخدم مفتاح الخادم إطلاقًا |
| `POST /api/validate-key` بـ `env` في وضع user | ✅ رفض صريح: «هذا الخادم لا يوفّر مفتاحًا خاصًا به؛ كل مستخدم يستخدم مفتاحه.» |
| ملفات النشر (`compose.yaml` + `docker-publish.yml`) | ✅ تحقّق بنيوي عبر `npm run validate:deploy` (لا Docker على جهاز التطوير لتنفيذ `compose config`) |
| بناء صورة Docker على ARM64 | ⏳ يحتاج سيرفرك — GitHub Actions يبنيها لـ `linux/arm64` تلقائيًا |

> الترجمة الكاملة (نص/صوت) تحتاج مفتاح المستخدم من نوع `AIza…`، ويُدخل من شاشة البداية أو الإعدادات ⚙️.
> جميع مسارات معالجة الأخطاء والتحقق والأصول وفرض BYOK اختُبرت فعليًا، ومسار Gemini مُثبت الوصول والتصنيف.
>
> **غير مُتحقَّق منه آليًا** (يحتاج جهازًا فيه ميكروفون ومفاتيح حقيقية): جودة النطق الفعلية (TTS)،
> دقة قطع الصوت في وضع VAD داخل متصفح حقيقي، وتسجيل PWA فعليًا على هاتف.
>
> **غير مُتحقَّق منه آليًا في بيئة التطوير**: بناء وتشغيل صورة Docker (لا يوجد Docker daemon على هذا
> الجهاز). لذلك تم تجهيز الملفات بحيث تُبنى الصورة فعلًا على GitHub Actions وتُشغَّل على سيرفرك،
> مع سكربتات تتحقق من البيئة وتطبع السجلات عند أي فشل. راجع [deploy/README.md](deploy/README.md).
