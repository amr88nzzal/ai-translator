/**
 * Full-stack entry point: Express API + PWA asset endpoints + Vite middleware
 * (development) or the compiled client bundle (production).
 *
 * Production bundle: `dist/server.cjs` (CJS). Nothing here relies on
 * `import.meta.url`, so the same file runs on Cloud Run / Docker.
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';

import {
  MAX_AUDIO_BYTES,
  SUPPORTED_AUDIO_MIME_TYPES,
  type ApiOk,
  type HealthResponse,
  type PresetId,
  type ToneId,
  type TranslationOptions,
  type TranslationPayload,
} from '../shared/api-contract.js';
import { config, isServerKeyConfigured } from './config.js';
import { ApiFailure, BAD_REQUEST, INTERNAL } from './errors.js';
import { logger } from './logger.js';
import { APP_ROOT, CLIENT_DIST, CLIENT_ROOT, PUBLIC_ROOT } from './runtime.js';
import { MissingApiKeyError, modelCascade, probeApiKey, translate, validateApiKeyFormat } from './gemini.js';

const PRESETS: readonly PresetId[] = [
  'general',
  'medical',
  'tech',
  'legal',
  'business',
  'casual',
  'tourism',
  'academic',
];
const TONES: readonly ToneId[] = ['professional', 'casual', 'academic', 'concise'];
const LANG_PATTERN = /^[a-z]{2}(-[A-Za-z]{2,8})?$|^auto$/;
const MAX_TEXT_CHARS = 40_000;
const MAX_BASE64_CHARS = Math.ceil(MAX_AUDIO_BYTES / 3) * 4 + 1024;

/* ------------------------------------------------------------------ helpers */

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const requireLang = (value: unknown, field: string): string => {
  const raw = str(value);
  if (!raw) throw BAD_REQUEST(`الحقل ${field} مطلوب.`);
  if (!LANG_PATTERN.test(raw)) throw BAD_REQUEST(`قيمة ${field} غير صحيحة: «${raw}». استخدم رمز لغة مثل ar أو en أو auto.`);
  return raw;
};

const requireEnum = <T extends string>(value: unknown, allowed: readonly T[], field: string, fallback: T): T => {
  const raw = str(value);
  if (!raw) return fallback;
  if (!allowed.includes(raw as T)) {
    throw BAD_REQUEST(`قيمة ${field} غير مدعومة: «${raw}».`, `allowed: ${allowed.join(', ')}`);
  }
  return raw as T;
};

const parseOptions = (body: Record<string, unknown>): TranslationOptions => {
  const hintsRaw = body.conversationHints;
  const conversationHints = Array.isArray(hintsRaw)
    ? hintsRaw
        .filter((h): h is string => typeof h === 'string')
        .map((h) => h.trim())
        .filter((h) => h.length > 0)
        .slice(-4)
    : [];

  const options: TranslationOptions = {
    sourceLang: requireLang(body.sourceLang ?? 'auto', 'sourceLang'),
    targetLang: requireLang(body.targetLang, 'targetLang'),
    preset: requireEnum(body.preset, PRESETS, 'preset', 'general'),
    tone: requireEnum(body.tone, TONES, 'tone', 'professional'),
  };

  const customContext = str(body.customContext);
  if (customContext) options.customContext = customContext.slice(0, 1200);
  if (conversationHints.length > 0) options.conversationHints = conversationHints.map((h) => h.slice(0, 600));

  return options;
};

const okEnvelope = <T>(data: T, meta: ApiOk<T>['meta']): ApiOk<T> => ({ ok: true, data, meta });

const asyncRoute =
  (handler: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };

/** Very small in-memory guard so a single client cannot hammer the model endpoints. */
const inflight = new Map<string, number>();
const MAX_CONCURRENT_PER_IP = 3;
const guardConcurrency = (req: Request, res: Response, next: NextFunction): void => {
  const ip = req.ip ?? 'unknown';
  const current = inflight.get(ip) ?? 0;
  if (current >= MAX_CONCURRENT_PER_IP) {
    next(
      new ApiFailure({
        code: 'RESOURCE_EXHAUSTED',
        status: 429,
        message: 'هناك طلبات ترجمة قيد التنفيذ من هذا الجهاز. انتظر انتهاءها ثم أعد المحاولة.',
        detail: 'concurrency guard',
      }),
    );
    return;
  }
  inflight.set(ip, current + 1);
  const release = (): void => {
    const remaining = (inflight.get(ip) ?? 1) - 1;
    if (remaining <= 0) inflight.delete(ip);
    else inflight.set(ip, remaining);
  };
  res.on('finish', release);
  res.on('close', release);
  next();
};

/**
 * حماية الخادم نفسه: سقف طلبات لكل IP في نافذة زمنية متحركة.
 *
 * في نموذج «مفتاح المستخدم» لا نحمي حصة Gemini (كل مستخدم يتحمل حصته)، بل نحمي
 * السيرفر من الاستهلاك المفرط للعرض/المعالجة ومن أي إساءة استخدام تلقائية.
 * العدّاد في الذاكرة (يكفي لنسخة واحدة)، ويُصفّر نفسه دوريًا.
 */
const requestWindows = new Map<string, number[]>();
const WINDOW_MS = 60 * 60 * 1000;

const guardRateLimit = (req: Request, res: Response, next: NextFunction): void => {
  const limit = config.maxRequestsPerIpPerHour;
  if (limit <= 0) {
    next();
    return;
  }

  const ip = req.ip ?? 'unknown';
  const now = Date.now();
  const hits = (requestWindows.get(ip) ?? []).filter((stamp) => now - stamp < WINDOW_MS);

  if (hits.length >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((WINDOW_MS - (now - (hits[0] ?? now))) / 1000));
    res.setHeader('Retry-After', String(retryAfterSeconds));
    next(
      new ApiFailure({
        code: 'RESOURCE_EXHAUSTED',
        status: 429,
        message: `تجاوزت حد الاستخدام المسموح من هذا الجهاز (${limit} طلبًا في الساعة). أعد المحاولة بعد قليل.`,
        detail: 'ip rate limit',
      }),
    );
    return;
  }

  hits.push(now);
  requestWindows.set(ip, hits);

  // تنظيف دوري بسيط لمنع تضخّم الخريطة على المدى الطويل.
  if (requestWindows.size > 5000) {
    for (const [key, stamps] of requestWindows) {
      const alive = stamps.filter((stamp) => now - stamp < WINDOW_MS);
      if (alive.length === 0) requestWindows.delete(key);
      else requestWindows.set(key, alive);
    }
  }

  next();
};

/* --------------------------------------------------------------------- app */

export interface CreateAppOptions {
  /**
   * `true`  → mount Vite in middleware mode (development: HMR + on-the-fly TS).
   * `false` → serve the pre-built bundle from `dist/client` (production).
   */
  withVite: boolean;
}

export async function createApp(options: CreateAppOptions): Promise<express.Express> {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  app.use(cors({ origin: true, exposedHeaders: ['X-Model-Used', 'X-Key-Source'] }));
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: false, limit: '50mb' }));

  // Security headers appropriate for a PWA served over HTTPS in production.
  app.use((_req, res, next) => {
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Permissions-Policy', 'microphone=(self), autoplay=(self)');
    next();
  });

  /* --------------------------------------------------- PWA asset endpoints */

  const pwaAsset = (fileName: string, contentType: string) => (_req: Request, res: Response): void => {
    // Serve the live file from client/public, so edits land without a rebuild.
    const candidates = [path.join(PUBLIC_ROOT, fileName), path.join(CLIENT_DIST, fileName)];
    const found = candidates.find((candidate) => fs.existsSync(candidate));

    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', fileName === 'sw.js' ? 'no-cache, no-store, must-revalidate' : 'public, max-age=3600');
    res.setHeader('Service-Worker-Allowed', '/');

    if (!found) {
      res.status(404).send(`/* ${fileName} not built yet */`);
      return;
    }
    res.sendFile(found);
  };

  app.get('/manifest.json', pwaAsset('manifest.json', 'application/manifest+json; charset=utf-8'));
  app.get('/manifest.webmanifest', pwaAsset('manifest.json', 'application/manifest+json; charset=utf-8'));
  app.get('/sw.js', pwaAsset('sw.js', 'application/javascript; charset=utf-8'));
  app.get('/offline.html', pwaAsset('offline.html', 'text/html; charset=utf-8'));

  /* ------------------------------------------------------------------- API */

  app.get('/api/health', (_req, res) => {
    const body: HealthResponse = {
      status: 'ok',
      serverKeyConfigured: isServerKeyConfigured(),
      authMode: config.authMode,
      models: modelCascade,
      version: config.appVersion,
      timestamp: new Date().toISOString(),
    };
    res.json(body);
  });

  app.get('/api/status', (_req, res) => {
    res.json({
      status: 'ok',
      serverKeyConfigured: isServerKeyConfigured(),
      authMode: config.authMode,
      models: modelCascade,
      version: config.appVersion,
      limits: {
        maxAudioBytes: MAX_AUDIO_BYTES,
        maxTextChars: MAX_TEXT_CHARS,
        maxRequestsPerIpPerHour: config.maxRequestsPerIpPerHour,
      },
      timestamp: new Date().toISOString(),
    });
  });

  app.post(
    '/api/validate-key',
    guardRateLimit,
    asyncRoute(async (req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const candidate = str(body.apiKey);

      // Sentinel used by the settings UI to test the server-side key.
      if (candidate === 'env') {
        if (!isServerKeyConfigured()) {
          res.json({
            valid: false,
            reason: 'هذا الخادم لا يوفّر مفتاحًا خاصًا به؛ كل مستخدم يستخدم مفتاحه.',
            checked: 'format',
          });
          return;
        }
        const result = await probeApiKey(undefined);
        res.json(result);
        return;
      }

      if (!candidate) throw BAD_REQUEST('أدخل مفتاح Gemini للتحقق منه.');

      const format = validateApiKeyFormat(candidate);
      if (!format.valid) {
        res.json({ valid: false, reason: format.reason ?? 'صيغة المفتاح غير صحيحة.', checked: 'format' });
        return;
      }
      const result = await probeApiKey(candidate);
      res.json(result);
    }),
  );

  app.post(
    '/api/translate-text',
    guardRateLimit,
    guardConcurrency,
    asyncRoute(async (req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const text = str(body.text);
      if (!text) throw BAD_REQUEST('النص المطلوب ترجمته فارغ.');
      if (text.length > MAX_TEXT_CHARS) {
        throw new ApiFailure({
          code: 'PAYLOAD_TOO_LARGE',
          message: `النص أطول من الحد المسموح (${MAX_TEXT_CHARS.toLocaleString('en-US')} حرف). قسّمه إلى أجزاء.`,
        });
      }

      const options = parseOptions(body);
      const result = await translate({ kind: 'text', text }, options, str(body.apiKey));

      res.setHeader('X-Model-Used', result.model);
      res.setHeader('X-Key-Source', result.keySource);
      res.setHeader('X-Attempts', String(result.attempts));
      res.setHeader('X-Latency-Ms', String(result.latencyMs));
      const data: TranslationPayload = result.data;
      res.json(
        okEnvelope(
          { ...data, ...(result.keyWarning ? { keyWarning: result.keyWarning } : {}) },
          {
            model: result.model,
            attempts: result.attempts,
            latencyMs: result.latencyMs,
            keySource: result.keySource,
          },
        ),
      );
    }),
  );

  app.post(
    '/api/translate-audio',
    guardRateLimit,
    guardConcurrency,
    asyncRoute(async (req, res) => {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const audioBase64 = str(body.audioBase64)?.replace(/^data:[^;]+;base64,/, '') ?? '';
      const mimeType = (str(body.mimeType) ?? 'audio/webm').toLowerCase();

      if (audioBase64.length === 0) {
        throw new ApiFailure({
          code: 'EMPTY_AUDIO',
          message: 'لم يتم استلام أي صوت. تأكد من أن الميكروفون يعمل ثم أعد التسجيل.',
        });
      }
      if (audioBase64.length > MAX_BASE64_CHARS) {
        throw new ApiFailure({
          code: 'PAYLOAD_TOO_LARGE',
          message: 'الملف الصوتي أكبر من الحد المسموح (45 ميجابايت). قسّم التسجيل إلى مقاطع أقصر.',
        });
      }
      if (!SUPPORTED_AUDIO_MIME_TYPES.some((allowed) => mimeType.startsWith(allowed))) {
        throw BAD_REQUEST(
          `صيغة الصوت غير مدعومة: «${mimeType}».`,
          `supported: ${SUPPORTED_AUDIO_MIME_TYPES.join(', ')}`,
        );
      }

      const estimatedBytes = Math.floor((audioBase64.length * 3) / 4);
      if (estimatedBytes < 1024) {
        throw new ApiFailure({
          code: 'EMPTY_AUDIO',
          message: 'التسجيل قصير جدًا أو فارغ. تحدث لمدة أطول قليلًا ثم أعد المحاولة.',
        });
      }

      const durationRaw = Number(body.durationMs);
      const durationMs = Number.isFinite(durationRaw) && durationRaw > 0 ? Math.round(durationRaw) : undefined;

      const options = parseOptions(body);
      const result = await translate(
        { kind: 'audio', audioBase64, mimeType, ...(durationMs ? { durationMs } : {}) },
        options,
        str(body.apiKey),
      );

      res.setHeader('X-Model-Used', result.model);
      res.setHeader('X-Key-Source', result.keySource);
      res.setHeader('X-Attempts', String(result.attempts));
      res.setHeader('X-Latency-Ms', String(result.latencyMs));
      res.json(
        okEnvelope(
          {
            ...result.data,
            durationMs: durationMs ?? null,
            ...(result.keyWarning ? { keyWarning: result.keyWarning } : {}),
          },
          {
            model: result.model,
            attempts: result.attempts,
            latencyMs: result.latencyMs,
            keySource: result.keySource,
          },
        ),
      );
    }),
  );

  /* ------------------------------------------- static assets + SPA serving */

  app.use('/icons', express.static(path.join(PUBLIC_ROOT, 'icons'), { maxAge: '7d', fallthrough: true }));

  if (!options.withVite) {
    if (!fs.existsSync(CLIENT_DIST)) {
      logger.warn('Production client bundle missing', { CLIENT_DIST });
    }
    app.use(
      express.static(CLIENT_DIST, {
        index: false,
        maxAge: '1h',
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
        },
      }),
    );

    app.get('/{*splat}', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      const indexFile = path.join(CLIENT_DIST, 'index.html');
      if (!fs.existsSync(indexFile)) {
        next();
        return;
      }
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(indexFile);
    });
  } else {
    const { createServer } = await import('vite');
    const vite = await createServer({
      root: CLIENT_ROOT,
      configFile: path.join(APP_ROOT, 'vite.config.ts'),
      appType: 'spa',
      server: { middlewareMode: true, host: true },
    });
    app.use(vite.middlewares);
    logger.info('Vite dev middleware attached (HMR enabled)');
  }

  /* --------------------------------------------------------- error surface */

  // Unmatched /api/* routes must be JSON, never the SPA fallback HTML.
  app.use('/api', (_req, res) => {
    res.status(404).json({
      error: { code: 'MODEL_NOT_FOUND', message: 'المسار المطلوب غير موجود على الخادم.', retryable: false },
    });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) {
      res.end();
      return;
    }

    if (error instanceof MissingApiKeyError) {
      res.status(error.status).json(error.toBody());
      return;
    }

    if (error instanceof ApiFailure) {
      if (error.status >= 500) logger.error('API failure', { code: error.code, detail: error.detail });
      else logger.warn('API failure', { code: error.code, detail: error.detail });
      res.status(error.status).json(error.toBody());
      return;
    }

    const anyError = error as { type?: string; status?: number; message?: string; code?: string };

    if (anyError?.type === 'entity.too.large' || anyError?.status === 413) {
      res.status(413).json({
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'حجم البيانات المرسلة أكبر من الحد المسموح (50 ميجابايت). قسّم التسجيل ثم أعد المحاولة.',
          retryable: false,
        },
      });
      return;
    }

    if (anyError?.type === 'entity.parse.failed') {
      res.status(400).json({
        error: { code: 'INVALID_ARGUMENT', message: 'تعذّر قراءة بيانات الطلب (JSON غير صالح).', retryable: false },
      });
      return;
    }

    if (anyError?.code === 'ABORT_ERR' || anyError?.type === 'request.aborted') {
      res.status(499).json({
        error: { code: 'UNAVAILABLE', message: 'أُلغي الطلب قبل اكتماله.', retryable: true },
      });
      return;
    }

    const failure = INTERNAL(
      'حدث خطأ غير متوقع في الخادم أثناء معالجة الطلب. أعد المحاولة، وإن تكرر الخطأ فراجع سجلات الخادم.',
      error,
      anyError?.message?.slice(0, 400),
    );
    logger.error('Unhandled server error', { message: anyError?.message });
    res.status(failure.status).json(failure.toBody());
  });

  return app;
}

export default createApp;
