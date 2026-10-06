/**
 * Shared contract between the Express server and the React client.
 * Keep this file free of Node.js and DOM APIs.
 */

/** Canonical error codes surfaced to the UI as Arabic banners. */
export type ApiErrorCode =
  | 'UNAUTHENTICATED'
  | 'RESOURCE_EXHAUSTED'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNAVAILABLE'
  | 'INVALID_ARGUMENT'
  | 'MODEL_NOT_FOUND'
  | 'EMPTY_AUDIO'
  | 'INTERNAL';

/** Every failure from /api/* has this shape — never HTML. */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    /** Arabic, user-facing, ready to render. */
    message: string;
    /** Optional technical detail (safe for logs / advanced UI). */
    detail?: string;
    /** Which model eventually produced the answer, when known. */
    model?: string;
    /** True when the failure is worth retrying as-is. */
    retryable?: boolean;
  };
}

export interface ApiOk<T> {
  ok: true;
  data: T;
  meta: {
    model: string;
    /** Number of fallback hops used before success (0 = first model worked). */
    attempts: number;
    latencyMs: number;
    /** `none` only appears on the health/probe envelopes, never on a success. */
    keySource: 'user' | 'server' | 'none';
  };
}

/** One specialised term discovered inside a segment. */
export interface KeyTerm {
  term: string;
  translation: string;
  note: string;
}

/** The strict JSON contract requested from Gemini (responseSchema). */
export interface TranslationPayload {
  transcription: string;
  translation: string;
  detectedLanguage: string;
  contextAnalysis: string;
  keyTerms: KeyTerm[];
}

/** Business domains supported by the prompting layer. */
export type PresetId =
  | 'general'
  | 'medical'
  | 'tech'
  | 'legal'
  | 'business'
  | 'casual'
  | 'tourism'
  | 'academic';

export type ToneId = 'professional' | 'casual' | 'academic' | 'concise';

export interface TranslationOptions {
  sourceLang: string;
  targetLang: string;
  preset: PresetId;
  tone: ToneId;
  /** Free-form extra instruction, e.g. "ترجم كتقرير طوارئ عاجل". */
  customContext?: string;
  /** Optional hints injected into the prompt (previous turns, live feed). */
  conversationHints?: string[];
}

export interface TranslateTextRequest extends TranslationOptions {
  text: string;
  /** Optional Gemini API key supplied by the user (never persisted server-side). */
  apiKey?: string;
}

export interface TranslateAudioRequest extends TranslationOptions {
  /** Base64 (no data-URL prefix) audio buffer. */
  audioBase64: string;
  /** e.g. audio/webm, audio/mp4, audio/wav, audio/m4a */
  mimeType: string;
  /** Duration of the recorded batch in milliseconds (prompt hint only). */
  durationMs?: number;
  apiKey?: string;
}

/**
 * كيف يحصل الخادم على مفتاح Gemini:
 *  - `user`   : مفتاح المستخدم إلزامي، ولا يوجد مفتاح على الخادم (الافتراضي للنشر العام).
 *  - `hybrid` : مفتاح المستخدم أولًا، ومفتاح الخادم خطة بديلة.
 */
export type AuthMode = 'user' | 'hybrid';

export interface HealthResponse {
  status: 'ok';
  /** True when the server may answer with its own key (hybrid mode only). */
  serverKeyConfigured: boolean;
  /** المصدر المعتمد للمفاتيح — تعرضه الواجهة لتوضيح المتوقع من المستخدم. */
  authMode: AuthMode;
  models: string[];
  version: string;
  timestamp: string;
}

export const MODEL_CASCADE = [
  'gemini-3.8-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-3.6-flash',
] as const;

export const SUPPORTED_AUDIO_MIME_TYPES = [
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/m4a',
  'audio/x-m4a',
  'audio/wav',
  'audio/wave',
  'audio/mpeg',
  'audio/aac',
  'audio/flac',
] as const;

export const MAX_AUDIO_BYTES = 45 * 1024 * 1024;
