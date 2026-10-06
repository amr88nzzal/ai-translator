/**
 * Typed client for the Express API.
 *
 * The browser never sees the server key: it only ever sends the user's own key
 * (when they provided one in settings). Every failure is normalised into a
 * `ClientApiError` carrying the Arabic message produced by the server.
 */
import { API_ROUTES } from '../constants';
import type { ClientApiError, PresetId, ToneId, TranslationCallResult } from '../types';
import type { ApiErrorBody, ApiOk, AuthMode, HealthResponse } from '@shared/api-contract';

export class TranslationApiError extends Error implements ClientApiError {
  readonly code: string;
  readonly detail?: string;
  readonly retryable: boolean;
  readonly status: number;

  constructor(init: ClientApiError) {
    super(init.message);
    this.name = 'TranslationApiError';
    this.code = init.code;
    this.detail = init.detail;
    this.retryable = init.retryable;
    this.status = init.status;
  }
}

const NETWORK_MESSAGE = 'تعذّر الاتصال بالخادم. تحقق من الشبكة أو من تشغيل الخادم ثم أعد المحاولة.';

const asFailure = (error: unknown, fallbackMessage = NETWORK_MESSAGE): TranslationApiError => {
  if (error instanceof TranslationApiError) return error;
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new TranslationApiError({
      code: 'UNAVAILABLE',
      message: 'أُلغيت العملية قبل اكتمالها.',
      retryable: true,
      status: 0,
    });
  }
  return new TranslationApiError({
    code: 'UNAVAILABLE',
    message: error instanceof Error && error.message ? error.message : fallbackMessage,
    retryable: true,
    status: 0,
  });
};

interface RequestOptions {
  signal?: AbortSignal;
  /** Per-request timeout; long audio batches need a generous value. */
  timeoutMs?: number;
}

async function postJson<T>(route: string, body: unknown, options: RequestOptions = {}): Promise<{ data: T; response: Response }> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 130_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = (): void => controller.abort();
  options.signal?.addEventListener('abort', onExternalAbort, { once: true });

  try {
    const response = await fetch(route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const raw = await response.text();
    let parsed: unknown = null;
    try {
      parsed = raw.length > 0 ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }

    if (!response.ok) {
      const structured = (parsed as ApiErrorBody | null)?.error;
      throw new TranslationApiError({
        code: structured?.code ?? 'INTERNAL',
        message: structured?.message ?? `فشل الطلب (رمز ${response.status}).`,
        ...(structured?.detail ? { detail: structured.detail } : {}),
        retryable: structured?.retryable ?? response.status >= 500,
        status: response.status,
      });
    }

    const envelope = parsed as ApiOk<T> | null;
    if (!envelope || envelope.ok !== true) {
      throw new TranslationApiError({
        code: 'INTERNAL',
        message: 'استجابة الخادم غير مفهومة. أعد المحاولة.',
        retryable: true,
        status: response.status,
      });
    }

    return { data: envelope.data, response };
  } catch (error) {
    throw asFailure(error);
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', onExternalAbort);
  }
}

export interface TranslateOptionsPayload {
  sourceLang: string;
  targetLang: string;
  preset: PresetId;
  tone: ToneId;
  customContext?: string;
  conversationHints?: string[];
  apiKey?: string;
}

/**
 * The server reports model/attempt/latency metadata in response headers so the
 * body stays a pure translation payload.
 */
const metaFrom = (response: Response): TranslationCallResult['meta'] => ({
  model: response.headers.get('X-Model-Used') ?? 'gemini',
  attempts: Number(response.headers.get('X-Attempts') ?? 1) || 1,
  latencyMs: Number(response.headers.get('X-Latency-Ms') ?? 0) || 0,
  keySource: (response.headers.get('X-Key-Source') as 'user' | 'server' | null) ?? 'server',
});

export async function translateText(
  payload: TranslateOptionsPayload & { text: string },
  options: RequestOptions = {},
): Promise<TranslationCallResult> {
  const { data, response } = await postJson<TranslationCallResult['data']>(API_ROUTES.translateText, payload, options);
  return { data, meta: metaFrom(response) };
}

export async function translateAudio(
  payload: TranslateOptionsPayload & { audioBase64: string; mimeType: string; durationMs?: number },
  options: RequestOptions = {},
): Promise<TranslationCallResult> {
  const { data, response } = await postJson<TranslationCallResult['data']>(API_ROUTES.translateAudio, payload, {
    ...options,
    timeoutMs: options.timeoutMs ?? 240_000,
  });
  return { data, meta: metaFrom(response) };
}

export interface KeyValidationResponse {
  valid: boolean;
  reason?: string;
  checked?: 'format' | 'network';
  model?: string;
}

/** `apiKey: 'env'` asks the server to test its own environment key. */
export async function validateApiKey(apiKey: string, options: RequestOptions = {}): Promise<KeyValidationResponse> {
  const { data } = await postJson<KeyValidationResponse>(API_ROUTES.validateKey, { apiKey }, { ...options, timeoutMs: 30_000 });
  return data;
}

export interface ServerStatus {
  status: string;
  /** True only when the server may answer with its own key (hybrid mode). */
  serverKeyConfigured: boolean;
  /** `user` = مفتاح المستخدم إلزامي، `hybrid` = يوجد مفتاح خادم كخطة بديلة. */
  authMode: AuthMode;
  models: string[];
  version: string;
  limits: { maxAudioBytes: number; maxTextChars: number; maxRequestsPerIpPerHour?: number };
  timestamp: string;
}

export async function fetchStatus(signal?: AbortSignal): Promise<ServerStatus> {
  try {
    const response = await fetch(API_ROUTES.status, { signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`status ${response.status}`);
    const parsed = (await response.json()) as ServerStatus | HealthResponse;
    const authMode: AuthMode = 'authMode' in parsed && parsed.authMode === 'hybrid' ? 'hybrid' : 'user';
    return {
      status: 'ok',
      serverKeyConfigured: 'serverKeyConfigured' in parsed ? parsed.serverKeyConfigured : false,
      authMode,
      models: 'models' in parsed && Array.isArray(parsed.models) ? parsed.models : [],
      version: 'version' in parsed ? String(parsed.version) : '1.0.0',
      limits:
        'limits' in parsed && parsed.limits
          ? parsed.limits
          : { maxAudioBytes: 45 * 1024 * 1024, maxTextChars: 40_000 },
      timestamp: 'timestamp' in parsed ? String(parsed.timestamp) : new Date().toISOString(),
    };
  } catch (error) {
    throw asFailure(error, 'الخادم غير متاح حاليًا.');
  }
}

export const isRetryable = (error: unknown): boolean =>
  error instanceof TranslationApiError ? error.retryable : true;
