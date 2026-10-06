/**
 * Client storage layer.
 *
 * Every read goes through schema validation (`mergeWithDefaults` for objects,
 * per-record normalisation for arrays) so a stale or corrupted browser payload
 * can never crash the app. The Gemini key lives under its own key and is only
 * written when the user explicitly asks to remember it.
 */
import { DEFAULT_SETTINGS, HISTORY_LIMIT_MAX, STORAGE_KEYS } from '../constants';
import type { AppSettings, GlossaryEntry, HistoryItem, KeyTerm, PresetId, ToneId, TranslationResult } from '../types';
import { mergeWithDefaults, safeJsonParse, truncate, uid } from './utils';

/* ------------------------------------------------------------- primitives */

function readRaw(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(key, value);
    return true;
  } catch {
    // Quota exceeded or private mode: fail softly, the app keeps working in memory.
    return false;
  }
}

function removeRaw(key: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/* --------------------------------------------------------------- settings */

export function loadSettings(): AppSettings {
  const parsed = safeJsonParse<unknown>(readRaw(STORAGE_KEYS.settings), null);
  const merged = mergeWithDefaults(DEFAULT_SETTINGS as unknown as Record<string, unknown>, parsed) as unknown as AppSettings;

  // Bounds check numeric preferences that the UI also clamps.
  merged.vadSilenceMs = Math.min(3000, Math.max(700, Math.round(merged.vadSilenceMs)));
  merged.vadThreshold = Math.min(0.25, Math.max(0.005, merged.vadThreshold));
  merged.speechRate = Math.min(1.4, Math.max(0.7, merged.speechRate));
  merged.speechVolume = Math.min(1, Math.max(0, merged.speechVolume));
  merged.historyLimit = Math.min(HISTORY_LIMIT_MAX, Math.max(20, Math.round(merged.historyLimit)));

  // The API key never lives here: it is owned by `lib/keyStore.ts`, which stores
  // it AES-GCM encrypted. `userApiKey` is an in-memory field only.
  merged.userApiKey = '';

  return merged;
}

export function saveSettings(settings: AppSettings): void {
  // Strip the in-memory secret before persisting preferences.
  const { userApiKey: _ignored, ...persistable } = settings;
  writeRaw(STORAGE_KEYS.settings, JSON.stringify(persistable));
  saveTheme(settings.theme);
}

/* ------------------------------------------------------------------ theme */

export function loadStoredTheme(): string | null {
  return readRaw(STORAGE_KEYS.theme);
}

export function saveTheme(theme: string): void {
  writeRaw(STORAGE_KEYS.theme, theme);
}

/* ---------------------------------------------------------------- history */

const asString = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);

const normalizeTerms = (value: unknown): KeyTerm[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const record = typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : {};
      return {
        term: asString(record.term).trim(),
        translation: asString(record.translation).trim(),
        note: asString(record.note).trim(),
      };
    })
    .filter((term) => term.term.length > 0);
};

/** Tolerant normaliser: accepts v1 records and future partial shapes. */
export function normalizeHistoryItem(raw: unknown): HistoryItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;

  const translation = asString(record.translation).trim();
  const transcription = asString(record.transcription).trim();
  const sourceText = asString(record.sourceText).trim();
  if (!translation && !transcription && !sourceText) return null;

  const createdAtRaw = Number(record.createdAt);
  const latencyRaw = Number(record.latencyMs);
  const durationRaw = Number(record.durationMs);

  const kind: HistoryItem['kind'] = record.kind === 'audio' ? 'audio' : 'text';

  return {
    id: asString(record.id) || uid('hist'),
    createdAt: Number.isFinite(createdAtRaw) && createdAtRaw > 0 ? createdAtRaw : Date.now(),
    kind,
    sourceText,
    transcription,
    translation,
    detectedLanguage: asString(record.detectedLanguage, 'غير محددة'),
    contextAnalysis: asString(record.contextAnalysis),
    keyTerms: normalizeTerms(record.keyTerms),
    sourceLang: asString(record.sourceLang, 'auto'),
    targetLang: asString(record.targetLang, 'en'),
    preset: (asString(record.preset, 'general') as PresetId) || 'general',
    tone: (asString(record.tone, 'professional') as ToneId) || 'professional',
    ...(asString(record.customContext) ? { customContext: asString(record.customContext) } : {}),
    model: asString(record.model, 'gemini'),
    latencyMs: Number.isFinite(latencyRaw) && latencyRaw > 0 ? Math.round(latencyRaw) : 0,
    ...(Number.isFinite(durationRaw) && durationRaw > 0 ? { durationMs: Math.round(durationRaw) } : {}),
    favorite: record.favorite === true,
  };
}

export function loadHistory(): HistoryItem[] {
  const parsed = safeJsonParse<unknown>(readRaw(STORAGE_KEYS.history), []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map(normalizeHistoryItem)
    .filter((item): item is HistoryItem => item !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function saveHistory(items: HistoryItem[]): void {
  const trimmed = items.slice(0, HISTORY_LIMIT_MAX);
  writeRaw(STORAGE_KEYS.history, JSON.stringify(trimmed));
}

/* --------------------------------------------------------------- glossary */

export function normalizeGlossaryEntry(raw: unknown): GlossaryEntry | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const term = asString(record.term).trim();
  const translation = asString(record.translation).trim();
  if (!term) return null;
  const countRaw = Number(record.count);
  const firstRaw = Number(record.firstSeenAt);
  const lastRaw = Number(record.lastSeenAt);
  return {
    id: asString(record.id) || uid('term'),
    term,
    translation,
    note: asString(record.note),
    sourceLang: asString(record.sourceLang, 'auto'),
    targetLang: asString(record.targetLang, 'en'),
    preset: (asString(record.preset, 'general') as PresetId) || 'general',
    count: Number.isFinite(countRaw) && countRaw > 0 ? Math.round(countRaw) : 1,
    firstSeenAt: Number.isFinite(firstRaw) && firstRaw > 0 ? firstRaw : Date.now(),
    lastSeenAt: Number.isFinite(lastRaw) && lastRaw > 0 ? lastRaw : Date.now(),
  };
}

export function loadGlossary(): GlossaryEntry[] {
  const parsed = safeJsonParse<unknown>(readRaw(STORAGE_KEYS.glossary), []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map(normalizeGlossaryEntry)
    .filter((entry): entry is GlossaryEntry => entry !== null)
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

export function saveGlossary(entries: GlossaryEntry[]): void {
  writeRaw(STORAGE_KEYS.glossary, JSON.stringify(entries.slice(0, 600)));
}

/**
 * Merges the terms of one translation into the glossary index, counting repeats
 * and refreshing the stored note when the model offers a richer explanation.
 */
export function mergeGlossaryEntries(
  existing: GlossaryEntry[],
  incoming: KeyTerm[],
  context: { sourceLang: string; targetLang: string; preset: PresetId; timestamp: number },
): GlossaryEntry[] {
  if (incoming.length === 0) return existing;

  const index = new Map<string, GlossaryEntry>();
  const keyOf = (term: string, translation: string, target: string): string =>
    `${term.trim().toLowerCase()}::${translation.trim().toLowerCase()}::${target}`;

  for (const entry of existing) index.set(keyOf(entry.term, entry.translation, entry.targetLang), entry);

  for (const term of incoming) {
    const key = keyOf(term.term, term.translation, context.targetLang);
    const found = index.get(key);
    if (found) {
      index.set(key, {
        ...found,
        count: found.count + 1,
        lastSeenAt: context.timestamp,
        note: term.note.length > found.note.length ? term.note : found.note,
      });
      continue;
    }
    index.set(key, {
      id: uid('term'),
      term: term.term,
      translation: term.translation,
      note: term.note,
      sourceLang: context.sourceLang,
      targetLang: context.targetLang,
      preset: context.preset,
      count: 1,
      firstSeenAt: context.timestamp,
      lastSeenAt: context.timestamp,
    });
  }

  return [...index.values()].sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

/* ------------------------------------------------------- result → history */

export function toHistoryItem(result: TranslationResult): HistoryItem {
  return {
    id: result.id,
    createdAt: result.createdAt,
    kind: result.kind,
    sourceText: result.sourceText,
    transcription: result.transcription,
    translation: result.translation,
    detectedLanguage: result.detectedLanguage,
    contextAnalysis: result.contextAnalysis,
    keyTerms: result.keyTerms,
    sourceLang: result.sourceLang,
    targetLang: result.targetLang,
    preset: result.preset,
    tone: result.tone,
    ...(result.customContext ? { customContext: result.customContext } : {}),
    model: result.model,
    latencyMs: result.latencyMs,
    ...(result.durationMs ? { durationMs: result.durationMs } : {}),
    favorite: false,
  };
}

/* --------------------------------------------------------------- exporting */

export interface ExportBundle {
  app: string;
  version: string;
  exportedAt: string;
  count: number;
  items: HistoryItem[];
}

export function buildExportBundle(items: HistoryItem[]): ExportBundle {
  return {
    app: 'المترجم الصوتي والسياقي الذكي',
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    count: items.length,
    items,
  };
}

export function buildPlainTextExport(items: HistoryItem[]): string {
  return items
    .map((item) => {
      const lines = [
        `# ${new Date(item.createdAt).toISOString()} — ${item.sourceLang} → ${item.targetLang} (${item.preset}/${item.tone})`,
        `المصدر: ${item.transcription || item.sourceText}`,
        `الترجمة: ${item.translation}`,
      ];
      if (item.contextAnalysis) lines.push(`السياق: ${truncate(item.contextAnalysis, 400)}`);
      if (item.keyTerms.length > 0) {
        lines.push('المصطلحات:');
        item.keyTerms.forEach((term) => lines.push(`  - ${term.term} = ${term.translation} (${term.note})`));
      }
      return lines.join('\n');
    })
    .join('\n\n----------------------------------------\n\n');
}

/** Clears everything this app owns. Used by the settings "reset" action. */
export function clearAllStoredData(): void {
  [STORAGE_KEYS.history, STORAGE_KEYS.glossary, STORAGE_KEYS.settings, STORAGE_KEYS.apiKey, STORAGE_KEYS.lastSession].forEach(
    removeRaw,
  );
}
