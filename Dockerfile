# syntax=docker/dockerfile:1
#
# المترجم الصوتي والسياقي الذكي — صورة إنتاج متعددة المعماريات (amd64 / arm64)
#
# ملاحظات التصميم:
#  - كل الحزم الأصلية (esbuild، oxide، lightningcss) تُثبَّت عبر حزم platform
#    الاختيارية، لذا تعمل الصورة على arm64 وamd64 دون أي تعديل.
#  - `npm ci --ignore-scripts` آمن: لا توجد حاجة لأي سكربت تثبيت هنا.
#  - الخادم يعمل بمستخدم غير جذري، والصورة لا تحتوي على node_modules في مرحلة
#    التشغيل إلا ما يلزم الإنتاج فقط.

# ---------- 1) مرحلة البناء ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app

ENV npm_config_update_notifier=false \
    npm_config_fund=false \
    npm_config_audit=false \
    CI=true

# ملفات الاعتماديات أولًا لاستغلال طبقات الكاش.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# بقية المصادر المطلوبة للبناء.
COPY tsconfig.json vite.config.mjs vite.config.ts ./
COPY client ./client
COPY server ./server
COPY shared ./shared
COPY scripts ./scripts

# لا نكرر فحص الأنواع هنا: GitHub Actions يفعل ذلك في مهمة verify قبل النشر،
# و`npm run build` نفسه يفشل لو كانت الحِزم غير سليمة.
RUN npm run build

# ---------- 2) مرحلة التشغيل ----------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3500 \
    HOST=0.0.0.0 \
    APP_VERSION=1.0.0

# اعتماديات الإنتاج فقط (المخرجات مبنية مسبقًا في المرحلة السابقة).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
 && npm cache clean --force

COPY --from=build /app/dist ./dist

# تشغيل بمستخدم غير جذري (مملوك مسبقًا في صورة node الرسمية).
RUN chown -R node:node /app
USER node

EXPOSE 3500

# فحص حياة يستخدم fetch المدمجة في Node 18+ (لا curl في الصورة).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3500)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tini غير مطلوب: Node يتعامل مع SIGTERM مباشرة عبر start.ts.
STOPSIGNAL SIGTERM

CMD ["node", "dist/server.cjs"]
