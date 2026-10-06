/**
 * Client-side domain types. Everything the UI touches is typed here so the
 * translation pipeline, recorder, history and glossary share one vocabulary.
 */
import type { KeyTerm, PresetId, ToneId, TranslationPayload } from '@shared/api-contract';

export type { KeyTerm, PresetId, ToneId, TranslationPayload };

export type ThemeMode = 'light' | 'dark' | 'system';
export type AppLocale = 'ar' | 'en';
export type Direction = 'rtl' | 'ltr';

/** The three recording interactions required by the specification. */
export type RecorderMode = 'toggle' | 'hold' | 'continuous';

export type RecordingPhase = 'idle' | 'requesting' | 'recording' | 'paused' | 'processing' | 'error';

/** Lifecycle of a translation segment, used by the live feed. */
export type SegmentStatus = 'pending' | 'recording' | 'processing' | 'completed' | 'error';

export interface LanguageOption {
  code: string;
  /** Native label, always shown in its own script. */
  nativeLabel: string;
  englishLabel: string;
  /** Short code shown in compact selectors. */
  short: string;
  direction: Direction;
  /** Full BCP-47 tag for SpeechSynthesis. */
  speechTag: string;
  /** Preferred SpeechSynthesis voice hints, in priority order. */
  voiceHints?: string[];
}

export interface PresetOption {
  id: PresetId;
  labelAr: string;
  labelEn: string;
  /** One-line Arabic description shown in the picker. */
  descriptionAr: string;
  /** Emoji used as the compact badge (no extra icon dependency). */
  emoji: string;
}

export interface ToneOption {
  id: ToneId;
  labelAr: string;
  labelEn: string;
  descriptionAr: string;
  emoji: string;
}

/** Result of one translation call, ready to render and to archive. */
export interface TranslationResult {
  /** Client-side id (crypto.randomUUID with a safe fallback). */
  id: string;
  kind: 'text' | 'audio';
  sourceText: string;
  transcription: string;
  translation: string;
  detectedLanguage: string;
  contextAnalysis: string;
  keyTerms: KeyTerm[];
  sourceLang: string;
  targetLang: string;
  preset: PresetId;
  tone: ToneId;
  customContext?: string;
  model: string;
  attempts: number;
  latencyMs: number;
  keySource: 'user' | 'server';
  keyWarning?: string;
  createdAt: number;
  durationMs?: number;
  audioMimeType?: string;
  /** Object URL of the recorded blob, when the result came from audio. */
  audioUrl?: string;
  /**
   * Same recording, exposed to the source card. Kept separate so consumers can
   * decide whether the original audio belongs next to the transcript or the
   * translation.
   */
  sourceAudioUrl?: string;
}

/** A live/continuous conversation block. */
export interface LiveSegment {
  id: string;
  index: number;
  status: SegmentStatus;
  durationMs: number;
  createdAt: number;
  transcription: string;
  translation: string;
  detectedLanguage: string;
  contextAnalysis: string;
  keyTerms: KeyTerm[];
  error?: string;
  model?: string;
  latencyMs?: number;
  audioUrl?: string;
  /** Raw audio kept for "batch replay" of the segment. */
  audioBase64?: string;
  audioMimeType?: string;
}

export interface HistoryItem {
  id: string;
  createdAt: number;
  kind: 'text' | 'audio';
  sourceText: string;
  transcription: string;
  translation: string;
  detectedLanguage: string;
  contextAnalysis: string;
  keyTerms: KeyTerm[];
  sourceLang: string;
  targetLang: string;
  preset: PresetId;
  tone: ToneId;
  customContext?: string;
  model: string;
  latencyMs: number;
  durationMs?: number;
  favorite: boolean;
}

/** A glossary entry aggregated across the whole history. */
export interface GlossaryEntry {
  id: string;
  term: string;
  translation: string;
  note: string;
  sourceLang: string;
  targetLang: string;
  preset: PresetId;
  /** How many times this term/translation pair was observed. */
  count: number;
  firstSeenAt: number;
  lastSeenAt: number;
}

export interface AppSettings {
  /**
   * مفتاح Gemini الخاص بالمستخدم — حقل في الذاكرة فقط.
   * التخزين الفعلي (المشفّر) تتولاه `lib/keyStore.ts`، وليس هذا الكائن.
   */
  userApiKey: string;
  theme: ThemeMode;
  locale: AppLocale;
  defaultSourceLang: string;
  defaultTargetLang: string;
  defaultPreset: PresetId;
  defaultTone: ToneId;
  defaultRecorderMode: RecorderMode;
  /** Milliseconds of silence that closes a live segment (1000-2500). */
  vadSilenceMs: number;
  /** 0..1 RMS threshold below which audio counts as silence. */
  vadThreshold: number;
  /** 0.7..2 speech speed for text-to-speech. */
  speechRate: number;
  /** 0..1 synthesis volume. */
  speechVolume: number;
  /** Preferred voice URI for the target language. */
  speechVoiceUri: string;
  /** Auto-speak every finished translation. */
  autoSpeak: boolean;
  /** Minimum segment length in continuous mode (ms) to avoid junk. */
  minSegmentMs: number;
  /** Ask before clearing history. */
  confirmDestructive: boolean;
  /** Keep the last N history entries. */
  historyLimit: number;
}

export interface ToastMessage {
  id: string;
  tone: 'success' | 'error' | 'info' | 'warning';
  title: string;
  description?: string;
}

export interface AudioDeviceSummary {
  label: string;
  deviceId: string;
}

export interface RecorderLevels {
  /** 0..1 overall loudness, for the visualiser. */
  level: number;
  /** 0..1 normalized frequency bars (48 buckets). */
  bars: number[];
  /** Whether the VAD currently considers the input as speech. */
  speaking: boolean;
  /** Milliseconds of continuous silence observed so far. */
  silenceMs: number;
}

export interface TranslationRequestMeta {
  model: string;
  attempts: number;
  latencyMs: number;
  keySource: 'user' | 'server';
}

export interface TranslationResponse extends TranslationPayload {
  durationMs?: number | null;
  keyWarning?: string;
}

export interface TranslationCallResult {
  data: TranslationResponse;
  meta: TranslationRequestMeta;
}

/** Error shape thrown by the API client, already localised in Arabic. */
export interface ClientApiError {
  code: string;
  message: string;
  detail?: string;
  retryable: boolean;
  status: number;
}

export interface SpeechVoiceOption {
  uri: string;
  name: string;
  lang: string;
  localService: boolean;
}
