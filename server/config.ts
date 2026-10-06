import process from 'node:process';
import { MODEL_CASCADE } from '../shared/api-contract.js';

/**
 * وضع المصادقة:
 *  - `user`   : كل طلب يجب أن يحمل مفتاح المستخدم. مفتاح الخادم غير مستخدم
 *               إطلاقًا حتى لو وُجد في البيئة. هذا هو الافتراضي لنشر عام.
 *  - `hybrid` : مفتاح المستخدم أولًا، ومفتاح الخادم خطة بديلة عند غياب مفتاح
 *               المستخدم أو رفضه. مناسب للاستخدام الداخلي أو التجربة.
 */
export type AuthMode = 'user' | 'hybrid';

/** Server environment, resolved once at boot. */
export interface ServerConfig {
  port: number;
  host: string;
  /** Server-side Gemini key. Never sent to the browser. */
  serverApiKey?: string;
  /** Whether the server key may be used at all (see AuthMode). */
  authMode: AuthMode;
  /** Ordered fallback list of Gemini models. */
  models: string[];
  /** Extra tries per model for transient 503/429 spikes. */
  maxAttemptsPerModel: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  requestTimeoutMs: number;
  /**
   * Max requests per IP per rolling hour. Protects the server itself (bandwidth,
   * concurrency) even when every caller brings their own key.
   */
  maxRequestsPerIpPerHour: number;
  appVersion: string;
}

const readInt = (raw: string | undefined, fallback: number): number => {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * The specification's cascade, but any deployment can override it with the
 * GEMINI_MODELS env var (comma separated, ordered) when Google retires a model.
 */
const resolveModels = (): string[] => {
  const raw = process.env.GEMINI_MODELS;
  if (raw && raw.trim().length > 0) {
    const parsed = raw
      .split(',')
      .map((m) => m.trim())
      .filter((m) => m.length > 0);
    if (parsed.length > 0) return parsed;
  }
  return [...MODEL_CASCADE];
};

/**
 * الافتراضي `user`: النشر العام يعتمد على مفاتيح المستخدمين وحدها.
 * لجعل مفتاح الخادم متاحًا كخطة بديلة اضبط `AUTH_MODE=hybrid` صراحةً.
 */
const resolveAuthMode = (): AuthMode => {
  const raw = (process.env.AUTH_MODE ?? 'user').trim().toLowerCase();
  return raw === 'hybrid' ? 'hybrid' : 'user';
};

export const config: ServerConfig = {
  // 3500 هو المنفذ المعتمد لهذا المشروع (راجع compose.yaml و .env.example).
  port: readInt(process.env.PORT, 3500),
  host: process.env.HOST ?? '0.0.0.0',
  // In `user` mode the environment key is deliberately ignored: a shared key on a
  // public server is a quota and cost hazard, not a convenience.
  ...(resolveAuthMode() === 'hybrid' && process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0
    ? { serverApiKey: process.env.GEMINI_API_KEY.trim() }
    : {}),
  authMode: resolveAuthMode(),
  models: resolveModels(),
  maxAttemptsPerModel: readInt(process.env.GEMINI_MAX_ATTEMPTS, 3),
  backoffBaseMs: readInt(process.env.GEMINI_BACKOFF_BASE_MS, 600),
  backoffMaxMs: readInt(process.env.GEMINI_BACKOFF_MAX_MS, 6000),
  requestTimeoutMs: readInt(process.env.GEMINI_TIMEOUT_MS, 115_000),
  maxRequestsPerIpPerHour: readInt(process.env.MAX_REQUESTS_PER_IP_PER_HOUR, 600),
  appVersion: process.env.APP_VERSION ?? '1.0.0',
};

/**
 * True when the server may answer with its own key.
 * In `user` mode this is always false, even if GEMINI_API_KEY is set.
 */
export const isServerKeyConfigured = (): boolean => config.authMode === 'hybrid' && Boolean(config.serverApiKey);
