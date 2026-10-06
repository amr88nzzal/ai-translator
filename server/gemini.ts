/**
 * Gemini resilience layer.
 *
 * Three independent protection mechanisms, in order:
 *   1. Per-model retry with exponential backoff + jitter for transient 503/429 spikes.
 *   2. Model cascade: when one model stays overloaded, the next flash model is used.
 *   3. Key recovery: the user's own key wins; an invalid/expired one silently falls
 *      back to the server environment key instead of failing the request.
 */
import { GoogleGenAI, type GenerateContentResponse } from '@google/genai';
import type { TranslationPayload } from '../shared/api-contract.js';
import { config } from './config.js';
import { ApiFailure, INTERNAL } from './errors.js';
import { logger } from './logger.js';
import { buildSystemInstruction, buildUserInstruction } from './prompt.js';
import type { TranslationOptions } from '../shared/api-contract.js';

/**
 * صيغ مفاتيح Gemini المقبولة شكلًا.
 *
 *  - `AIza…` : الصيغة الكلاسيكية المنشأة من Google AI Studio.
 *  - `AQ.…`  : صيغة أحدث (ترد من AI Studio / Vertex Express). **لا تُرفض** — رفضها
 *              كان يمنع مستخدمين حقيقيين من استخدام التطبيق.
 *
 * ملاحظة تنفيذية مهمة: مفاتيح `AQ.` تعمل على سطح Google AI Studio الافتراضي
 * (`generativelanguage.googleapis.com`) الذي يستخدمه `@google/genai` عند تمرير
 * `apiKey`. لا تُوجَّه إلى نقطة Vertex (`aiplatform.googleapis.com`) لأن ذلك
 * يُنتج خطأ «مفتاح غير صالح» مضلّلًا.
 *
 * حدود التحقق: نتحقق فقط من «شكل المفتاح» (بادئة + محارف مسموحة + عدم وجود فراغات)
 * لمنع الطلبات العديمة الفائدة. لا نفرض حدًا أدنى للطول، لأن أطوال مفاتيح `AQ.`
 * غير معلنة، وفرض طول خاطئ يرفض مفتاحًا صحيحًا قبل تجربته — وهذا أسوأ من إرسال
 * طلب واحد فاشل. الحكم النهائي دائمًا من استدعاء Google الفعلي.
 */
const API_KEY_PATTERN = /^(?:AIza[0-9A-Za-z_-]{18,}|AQ\.[0-9A-Za-z_.-]{4,})$/;
/** Temporary OAuth access tokens can never be used as an API key. */
const OAUTH_TOKEN_PATTERN = /^ya29\./;

export type KeySource = 'user' | 'server' | 'none';

export interface ResolvedKey {
  apiKey: string;
  source: KeySource;
  /** Present when a supplied user key was rejected and we recovered. */
  warning?: string;
}

export class MissingApiKeyError extends ApiFailure {
  constructor(warning?: string) {
    super({
      code: 'UNAUTHENTICATED',
      message:
        'لم يصل مفتاح Gemini مع الطلب. أضف مفتاحك الشخصي من الإعدادات ⚙️ أو من شاشة البداية (يبدأ عادة بـ AIza أو AQ.).',
      ...(warning ? { detail: warning } : {}),
    });
    this.name = 'MissingApiKeyError';
  }
}

/** يُطلق عندما يرفض المستخدم إدخال مفتاح ومفتاح الخادم غير مسموح في هذا الوضع. */
export class UserKeyRequiredError extends ApiFailure {
  constructor(detail?: string) {
    super({
      code: 'UNAUTHENTICATED',
      message:
        'هذا الخادم لا يستخدم مفتاحًا مشتركًا: كل مستخدم يستخدم مفتاح Gemini الخاص به. أضف مفتاحك من الإعدادات ⚙️.',
      ...(detail ? { detail } : {}),
    });
    this.name = 'UserKeyRequiredError';
  }
}

export interface ValidateKeyResult {
  valid: boolean;
  /** Arabic reason, ready for the UI. */
  reason?: string;
}

/**
 * Pure format validation — no network round trip.
 *
 * Accepts both key families (`AIza…` and `AQ.…`) so a newer AI Studio key is not
 * rejected before it is even tried.
 */
export function validateApiKeyFormat(raw: string): ValidateKeyResult {
  const key = raw.trim();
  if (key.length === 0) return { valid: false, reason: 'المفتاح فارغ.' };
  if (/\s/.test(key)) {
    return { valid: false, reason: 'المفتاح يحتوي على مسافة أو سطر جديد. انسخه كاملًا دون فواصل.' };
  }
  if (OAUTH_TOKEN_PATTERN.test(key)) {
    return {
      valid: false,
      reason: 'هذا رمز وصول مؤقت (OAuth) وليس مفتاح API. أنشئ مفتاحًا من Google AI Studio.',
    };
  }
  if (key.length === 0 || key.length < 8) {
    return {
      valid: false,
      reason: `المفتاح قصير جدًا (${key.length} محرفًا). تأكد أنك نسخت المفتاح كاملًا.`,
    };
  }
  if (!API_KEY_PATTERN.test(key)) {
    return {
      valid: false,
      reason:
        'صيغة المفتاح غير معروفة. مفاتيح Gemini تبدأ عادة بـ AIza أو AQ. وتتكون من أحرف وأرقام وشرطات ونقاط.',
    };
  }
  return { valid: true };
}

/**
 * Key resolution.
 *
 *  - `user` mode (default): only the caller's key is ever used. A configured
 *    GEMINI_API_KEY is ignored, so a public deployment cannot be drained by
 *    strangers.
 *  - `hybrid` mode: the caller's key wins; a rejected or missing one falls back to
 *    the server key with a warning the UI surfaces.
 */
export function resolveApiKey(userKey?: string): ResolvedKey {
  const trimmed = (userKey ?? '').trim();
  const serverKey = config.serverApiKey;
  const hybridAllowed = config.authMode === 'hybrid' && Boolean(serverKey);

  if (trimmed.length > 0) {
    const check = validateApiKeyFormat(trimmed);
    if (check.valid) {
      /**
       * تشخيص مفيد بلا كشف المفتاح: البادئة + الطول فقط.
       * نسخ المفتاح ناقصًا هو أشهر سبب لخطأ `access_token_type_unsupported` مع
       * مفاتيح `AQ.`، ومقارنة الطول تكشفه فورًا في السجلات.
       */
      logger.info('Using user-provided API key', {
        keyPrefix: `${trimmed.slice(0, 3)}…`,
        keyLength: trimmed.length,
      });
      return { apiKey: trimmed, source: 'user' };
    }

    if (hybridAllowed) {
      logger.warn('Rejected user API key, recovered with server key', { reason: check.reason });
      return {
        apiKey: serverKey!,
        source: 'server',
        warning: `${check.reason ?? 'المفتاح غير صالح'} تم استخدام مفتاح الخادم بدلًا منه.`,
      };
    }
    throw new MissingApiKeyError(check.reason);
  }

  if (hybridAllowed) return { apiKey: serverKey!, source: 'server' };
  if (config.authMode === 'user' && serverKey) throw new UserKeyRequiredError('server key present but ignored');
  throw new MissingApiKeyError();
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Full jitter exponential backoff, capped by configuration. */
const backoffDelay = (attempt: number): number => {
  const ceiling = Math.min(config.backoffMaxMs, config.backoffBaseMs * 2 ** (attempt - 1));
  return Math.round(ceiling / 2 + Math.random() * (ceiling / 2));
};

interface ErrorLike {
  message?: string;
  status?: number | string;
  code?: number | string;
  error?: { code?: number | string; status?: string; message?: string };
}

const asErrorLike = (error: unknown): ErrorLike =>
  typeof error === 'object' && error !== null ? (error as ErrorLike) : { message: String(error) };

const errorBlob = (error: unknown): string => {
  const e = asErrorLike(error);
  return [e.message, e.status, e.code, e.error?.message, e.error?.status, e.error?.code]
    .filter((v) => v !== undefined && v !== null)
    .join(' | ')
    .toLowerCase();
};

/** Maps any Gemini/transport error onto a typed Arabic API failure. */
function classify(error: unknown, model: string, keySource: KeySource): ApiFailure {
  const blob = errorBlob(error);
  const numeric = Number(asErrorLike(error).status ?? asErrorLike(error).code ?? asErrorLike(error).error?.code);

  // HTTP 413 from the model side, or a raw size complaint: a distinct AR Arabic message.
  if (
    numeric === 413 ||
    blob.includes('payload too large') ||
    blob.includes('request entity too large') ||
    blob.includes('exceeds the maximum') ||
    blob.includes('too large')
  ) {
    return new ApiFailure({
      code: 'PAYLOAD_TOO_LARGE',
      message: 'حجم المقطع الصوتي أو النص كبير جدًا. قصّر التسجيل أو قسّمه إلى مقاطع أقصر ثم أعد المحاولة.',
      detail: blob.slice(0, 400),
      model,
    });
  }

  if (
    blob.includes('timed out') ||
    blob.includes('timeout') ||
    blob.includes('aborted') ||
    blob.includes('econnreset') ||
    blob.includes('socket hang up') ||
    blob.includes('fetch failed')
  ) {
    return new ApiFailure({
      code: 'UNAVAILABLE',
      message: 'انتهت مهلة الاتصال بخدمة Gemini أو انقطع الاتصال. تحقق من الشبكة وأعد المحاولة.',
      detail: blob.slice(0, 400),
      model,
      retryable: true,
    });
  }

  /**
   * حالة خاصة لمفاتيح `AQ.` (مفاتيح التفويض الجديدة من AI Studio).
   *
   * الخطأ `access_token_type_unsupported` يعني أن Google استلمت المفتاح فعلًا لكنها
   * رفضت نوع الاعتماد — وليس أنه «مفتاح خاطئ». أشهر سببين: نسخ غير مكتمل للمفتاح،
   * أو المفتاح ملتصق بحساب/مشروع غير مهيّأ. رسالة عامة بـ «مفتاح غير صالح» تُضلّل
   * المستخدم وتجعله يعيد المحاولة بلا فائدة.
   */
  if (blob.includes('access_token_type_unsupported') || blob.includes('expected oauth 2 access token')) {
    return new ApiFailure({
      code: 'UNAUTHENTICATED',
      status: 401,
      message:
        'وصل مفتاحك إلى Google لكنها رفضت نوع الاعتماد (access_token_type_unsupported). هذا يحدث عادةً مع مفاتيح AQ. عند نسخها ناقصة أو عندما لا يكون المفتاح مرتبطًا بمشروع مهيّأ. الحل: تأكد أنك نسخت المفتاح كاملًا من Google AI Studio (بلا قطع)، وإن استمر الخطأ فأنشئ مفتاحًا جديدًا، أو استخدم مفتاحًا من نوع AIza.',
      detail: blob.slice(0, 400),
      model,
    });
  }

  if (
    numeric === 401 ||
    numeric === 403 ||
    blob.includes('api key not valid') ||
    blob.includes('api_key_invalid') ||
    blob.includes('unauthenticated') ||
    blob.includes('permission denied') ||
    blob.includes('leaked')
  ) {
    return new ApiFailure({
      code: 'UNAUTHENTICATED',
      status: 401,
      message:
        keySource === 'user'
          ? config.authMode === 'hybrid'
            ? 'مفتاح Gemini المخصص غير مقبول أو منتهي الصلاحية. تحقق منه في الإعدادات ⚙️ أو أزل المفتاح لاستخدام المفتاح الاحتياطي على الخادم.'
            : 'مفتاح Gemini المخصص غير مقبول أو منتهي الصلاحية. أنشئ مفتاحًا جديدًا من Google AI Studio وأضفه من الإعدادات ⚙️.'
          : 'مفتاح Gemini على الخادم غير صالح أو غير مُصرّح له. راجع إعداد GEMINI_API_KEY.',
      detail: blob.slice(0, 400),
      model,
    });
  }

  if (numeric === 429 || blob.includes('resource_exhausted') || blob.includes('quota') || blob.includes('rate limit')) {
    return new ApiFailure({
      code: 'RESOURCE_EXHAUSTED',
      status: 429,
      message: 'تم استهلاك حصة الاستخدام المسموحة لهذا المفتاح مؤقتًا. انتظر قليلًا أو استخدم مفتاحًا آخر.',
      detail: blob.slice(0, 400),
      model,
      retryable: true,
    });
  }

  if (numeric === 404 || blob.includes('not found') || blob.includes('not supported')) {
    return new ApiFailure({
      code: 'MODEL_NOT_FOUND',
      status: 404,
      message: 'الموديل المطلوب غير متاح لحسابك. سيجري التطبيق تجربة الموديلات البديلة تلقائيًا.',
      detail: blob.slice(0, 400),
      model,
    });
  }

  if (numeric === 400 || blob.includes('invalid_argument') || blob.includes('invalid argument')) {
    return new ApiFailure({
      code: 'INVALID_ARGUMENT',
      status: 400,
      message: 'لم يتمكن Gemini من قراءة المدخل. تأكد من صيغة الصوت (webm/mp4/wav) أو أعد التسجيل.',
      detail: blob.slice(0, 400),
      model,
    });
  }

  if (
    numeric === 500 ||
    numeric === 502 ||
    numeric === 503 ||
    numeric === 504 ||
    blob.includes('unavailable') ||
    blob.includes('overloaded') ||
    blob.includes('high demand') ||
    blob.includes('internal')
  ) {
    return new ApiFailure({
      code: 'UNAVAILABLE',
      status: 503,
      message: 'خدمة Gemini مزدحمة حاليًا (طلبات مرتفعة). سنعيد المحاولة تلقائيًا، ويمكنك الضغط على «إعادة المحاولة».',
      detail: blob.slice(0, 400),
      model,
      retryable: true,
    });
  }

  return new ApiFailure({
    code: 'UNAVAILABLE',
    status: 502,
    message: 'تعذّر إكمال الترجمة من مزوّد الذكاء الاصطناعي. أعد المحاولة بعد لحظات.',
    detail: blob.slice(0, 400),
    model,
    retryable: true,
    cause: error,
  });
}

/**
 * The strict JSON contract. Explicit property order keeps the model from
 * drifting; `required` + `additionalProperties: false` makes the output parseable.
 */
export const translationResponseSchema = {
  type: 'object',
  properties: {
    transcription: {
      type: 'string',
      description: 'النص المنقول حرفيًا من الصوت أو النص الأصلي، بلغة المصدر.',
    },
    translation: {
      type: 'string',
      description: 'الترجمة السياقية النهائية في اللغة الهدف، جاهزة للاستخدام.',
    },
    detectedLanguage: {
      type: 'string',
      description: 'اللغة المكتشفة للمصدر مع اللهجة إن أمكن.',
    },
    contextAnalysis: {
      type: 'string',
      description: 'شرح موجز بالعربية للسياق والفروق الدلالية وسبب اختيار المفردات.',
    },
    keyTerms: {
      type: 'array',
      description: 'المصطلحات التخصصية المكتشفة.',
      items: {
        type: 'object',
        properties: {
          term: { type: 'string', description: 'المصطلح بلغة المصدر.' },
          translation: { type: 'string', description: 'المقابل في اللغة الهدف.' },
          note: { type: 'string', description: 'شرح أو تحذير موجز بالعربية.' },
        },
        required: ['term', 'translation', 'note'],
        additionalProperties: false,
      },
    },
  },
  required: ['transcription', 'translation', 'detectedLanguage', 'contextAnalysis', 'keyTerms'],
  additionalProperties: false,
  propertyOrdering: ['transcription', 'translation', 'detectedLanguage', 'contextAnalysis', 'keyTerms'],
} as const;

export type TranslateInput =
  | { kind: 'text'; text: string }
  | { kind: 'audio'; audioBase64: string; mimeType: string; durationMs?: number };

export interface TranslationOutcome {
  data: TranslationPayload;
  model: string;
  attempts: number;
  latencyMs: number;
  keySource: KeySource;
  /** Present when a user key was rejected and the server key was used. */
  keyWarning?: string;
}

const sanitizePayload = (raw: unknown): TranslationPayload => {
  const source = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const termsRaw = Array.isArray(source.keyTerms) ? source.keyTerms : [];

  const keyTerms = termsRaw
    .map((entry) => {
      const t = typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : {};
      return {
        term: typeof t.term === 'string' ? t.term.trim() : '',
        translation: typeof t.translation === 'string' ? t.translation.trim() : '',
        note: typeof t.note === 'string' ? t.note.trim() : '',
      };
    })
    .filter((t) => t.term.length > 0);

  return {
    transcription: typeof source.transcription === 'string' ? source.transcription.trim() : '',
    translation: typeof source.translation === 'string' ? source.translation.trim() : '',
    detectedLanguage:
      typeof source.detectedLanguage === 'string' && source.detectedLanguage.trim().length > 0
        ? source.detectedLanguage.trim()
        : 'غير محددة',
    contextAnalysis: typeof source.contextAnalysis === 'string' ? source.contextAnalysis.trim() : '',
    keyTerms,
  };
};

/** Parses the model reply, tolerating accidental markdown fences. */
export function parseModelJson(text: string): TranslationPayload {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    return sanitizePayload(JSON.parse(cleaned));
  } catch {
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try {
        return sanitizePayload(JSON.parse(cleaned.slice(first, last + 1)));
      } catch {
        /* fall through */
      }
    }
  }

  // Last resort: the model answered with prose. Keep it instead of failing the user.
  if (cleaned.length > 0) {
    return {
      transcription: '',
      translation: cleaned,
      detectedLanguage: 'غير محددة',
      contextAnalysis: 'أعاد الموديل إجابة غير مطابقة للمخطط، وتم عرض النص كما هو.',
      keyTerms: [],
    };
  }

  throw INTERNAL('أعاد الموديل استجابة فارغة.', undefined, 'empty model response');
}

const buildClient = (apiKey: string): GoogleGenAI => new GoogleGenAI({ apiKey });

const withTimeout = async <T>(promise: Promise<T>, ms: number, model: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new ApiFailure({
              code: 'UNAVAILABLE',
              message: 'استغرقت عملية الترجمة وقتًا أطول من المتوقع. أعد المحاولة بمقطع أقصر.',
              model,
              retryable: true,
              detail: `timeout after ${ms}ms`,
            }),
          );
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const extractText = (response: GenerateContentResponse): string => {
  const direct = typeof response.text === 'string' ? response.text : '';
  if (direct.trim().length > 0) return direct;

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .filter((chunk) => chunk.length > 0)
    .join('');
};

/**
 * The single entry point used by both /api/translate-text and /api/translate-audio.
 */
export async function translate(
  input: TranslateInput,
  options: TranslationOptions,
  userKey?: string,
): Promise<TranslationOutcome> {
  const resolved = resolveApiKey(userKey);
  const ai = buildClient(resolved.apiKey);
  const started = Date.now();

  const systemInstruction = buildSystemInstruction(options);
  const userInstruction = buildUserInstruction(
    options,
    input.kind,
    input.kind === 'audio' ? input.durationMs : undefined,
  );

  const parts: Array<Record<string, unknown>> = [{ text: userInstruction }];
  if (input.kind === 'text') {
    parts.push({ text: `<<<BEGIN SOURCE>>>\n${input.text}\n<<<END SOURCE>>>` });
  } else {
    parts.push({ inlineData: { mimeType: input.mimeType, data: input.audioBase64 } });
  }

  let attempts = 0;
  let lastFailure: ApiFailure | undefined;

  for (let modelIndex = 0; modelIndex < config.models.length; modelIndex += 1) {
    const model = config.models[modelIndex]!;

    for (let attempt = 1; attempt <= config.maxAttemptsPerModel; attempt += 1) {
      attempts += 1;
      try {
        const response = await withTimeout(
          ai.models.generateContent({
            model,
            contents: [{ role: 'user', parts }],
            config: {
              systemInstruction,
              temperature: input.kind === 'audio' ? 0.2 : 0.35,
              maxOutputTokens: 8192,
              responseMimeType: 'application/json',
              responseSchema: translationResponseSchema,
            },
          }),
          config.requestTimeoutMs,
          model,
        );

        const text = extractText(response);
        if (!text.trim()) throw INTERNAL('أعاد الموديل استجابة فارغة.', undefined, model);

        const data = parseModelJson(text);
        const outcome: TranslationOutcome = {
          data,
          model,
          attempts,
          latencyMs: Date.now() - started,
          keySource: resolved.source,
        };
        if (resolved.warning) outcome.keyWarning = resolved.warning;
        logger.info('Translation completed', {
          model,
          attempts,
          ms: outcome.latencyMs,
          keySource: resolved.source,
          mode: input.kind,
        });
        return outcome;
      } catch (error) {
        const failure = error instanceof ApiFailure ? error : classify(error, model, resolved.source);

        // An auth/payload problem will not fix itself by retrying the same model.
        if (!failure.retryable) {
          logger.warn('Translation failed (non-retryable)', {
            model,
            code: failure.code,
            status: failure.status,
          });
          throw failure;
        }

        lastFailure = failure;
        logger.warn('Transient model failure', {
          model,
          attempt,
          code: failure.code,
          willRetry: attempt < config.maxAttemptsPerModel,
        });

        if (attempt < config.maxAttemptsPerModel) {
          await sleep(backoffDelay(attempt));
          continue;
        }

        // Exhausted retries for this model: fall through to the next cascade entry.
        if (modelIndex < config.models.length - 1) {
          logger.warn('Cascading to next fallback model', {
            from: model,
            next: config.models[modelIndex + 1],
          });
        }
      }
    }
  }

  throw (
    lastFailure ??
    new ApiFailure({
      code: 'UNAVAILABLE',
      message: 'تعذّرت الترجمة عبر جميع الموديلات المتاحة. أعد المحاولة بعد قليل.',
    })
  );
}

/** Exposed for /api/health so the UI can show which cascade is active. */
export const modelCascade = config.models;

export interface ProbeResult {
  valid: boolean;
  /** Arabic message ready for the settings modal. */
  reason: string;
  model?: string;
  checked: 'format' | 'network';
  latencyMs?: number;
}

/**
 * Lightweight liveness check for a key: a single tiny text generation against the
 * cascade. Used by the settings modal and the first-run gate so users get a
 * definitive answer before their first real translation.
 */
export async function probeApiKey(userKey?: string): Promise<ProbeResult> {
  let resolved: ResolvedKey;
  try {
    resolved = resolveApiKey(userKey);
  } catch (error) {
    const failure = error instanceof ApiFailure ? error : undefined;
    return {
      valid: false,
      reason: failure?.message ?? 'لا يوجد مفتاح صالح للتحقق منه.',
      checked: 'format',
    };
  }

  const ai = buildClient(resolved.apiKey);
  const started = Date.now();

  for (const model of config.models) {
    try {
      const response = await withTimeout(
        ai.models.generateContent({
          model,
          contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: OK' }] }],
          config: { temperature: 0, maxOutputTokens: 16 },
        }),
        20_000,
        model,
      );
      const text = extractText(response);
      if (text.trim().length > 0) {
        return {
          valid: true,
          reason:
            resolved.source === 'user'
              ? `المفتاح يعمل بنجاح عبر الموديل ${model}.`
              : `مفتاح الخادم يعمل بنجاح عبر الموديل ${model}.`,
          model,
          checked: 'network',
          latencyMs: Date.now() - started,
        };
      }
    } catch (error) {
      const failure = error instanceof ApiFailure ? error : classify(error, model, resolved.source);
      if (!failure.retryable) {
        return { valid: false, reason: failure.message, model, checked: 'network' };
      }
      // transient: try the next model in the cascade
    }
  }

  return {
    valid: false,
    reason: 'تعذّر التحقق الآن: خدمة Gemini غير متاحة مؤقتًا. المفتاح قد يكون صالحًا، أعد المحاولة بعد قليل.',
    checked: 'network',
  };
}
