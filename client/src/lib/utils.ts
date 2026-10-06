/** Small, dependency-free helpers shared by every client module. */

/** `crypto.randomUUID` with a graceful fallback for insecure contexts. */
export function uid(prefix = 'id'): string {
  const globalCrypto = typeof crypto !== 'undefined' ? crypto : undefined;
  if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
    return `${prefix}_${globalCrypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export type ClassValue = string | number | false | null | undefined | ClassValue[];

/** Minimal `clsx`: joins truthy class names. */
export function cn(...values: ClassValue[]): string {
  const out: string[] = [];
  const walk = (value: ClassValue): void => {
    if (!value && value !== 0) return;
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    out.push(String(value));
  };
  values.forEach(walk);
  return out.join(' ');
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Thousands-separated integer, Western digits (readable inside RTL text). */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(value));
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatClock(timestamp: number): string {
  try {
    return new Intl.DateTimeFormat('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(timestamp);
  } catch {
    return new Date(timestamp).toLocaleTimeString();
  }
}

export function formatDateTime(timestamp: number): string {
  try {
    return new Intl.DateTimeFormat('ar-EG', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(timestamp);
  } catch {
    return new Date(timestamp).toLocaleString();
  }
}

export function relativeTime(timestamp: number, now = Date.now()): string {
  const diff = now - timestamp;
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'الآن';
  if (minutes < 60) return `قبل ${minutes} دقيقة`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `قبل ${hours} ساعة`;
  const days = Math.round(hours / 24);
  if (days < 30) return `قبل ${days} يوم`;
  return formatDateTime(timestamp);
}

export function truncate(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

/** True when the text is predominantly Arabic script. */
export function isArabicText(text: string): boolean {
  const arabic = (text.match(/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g) ?? []).length;
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  return arabic > latin;
}

/** Direction to apply to a text block based on its own content. */
export function detectDirection(text: string, fallback: 'rtl' | 'ltr' = 'rtl'): 'rtl' | 'ltr' {
  const arabic = (text.match(/[\u0600-\u06FF]/g) ?? []).length;
  if (arabic > 0) return 'rtl';
  const latin = (text.match(/[A-Za-z]/g) ?? []).length;
  if (latin > 0) return 'ltr';
  return fallback;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text.trim()) return false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const succeeded = document.execCommand('copy');
    document.body.removeChild(area);
    return succeeded;
  } catch {
    return false;
  }
}

export function downloadFile(filename: string, content: string, mime = 'application/json'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Blob → base64 (without the data-URL prefix). */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('تعذّر قراءة بيانات الصوت المسجّل.'));
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

/** Picks the first mime type the current browser can actually record. */
export function pickSupportedMimeType(candidates: readonly string[]): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }
  return candidates.find((candidate) => {
    try {
      return MediaRecorder.isTypeSupported(candidate);
    } catch {
      return false;
    }
  }) ?? '';
}

/** Notification + vibration best-effort for long live sessions. */
export function vibrate(pattern: number | number[]): void {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      (navigator as Navigator & { vibrate: (p: number | number[]) => boolean }).vibrate(pattern);
    }
  } catch {
    /* ignore */
  }
}

export function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Merge a persisted value into the current defaults so upgraded schemas never
 * produce `undefined` fields (this is the "schema validation" layer for
 * localStorage payloads).
 */
export function mergeWithDefaults<T extends Record<string, unknown>>(defaults: T, stored: unknown): T {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return { ...defaults };
  const incoming = stored as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...defaults };
  for (const key of Object.keys(defaults)) {
    const candidate = incoming[key];
    if (candidate === undefined || candidate === null) continue;
    const expected = defaults[key];
    if (typeof expected === 'number' && typeof candidate === 'number' && Number.isFinite(candidate)) merged[key] = candidate;
    else if (typeof expected === 'boolean' && typeof candidate === 'boolean') merged[key] = candidate;
    else if (typeof expected === 'string' && typeof candidate === 'string') merged[key] = candidate;
    else if (Array.isArray(expected) && Array.isArray(candidate)) merged[key] = candidate;
  }
  return merged as T;
}

/** Normalises loose user input into a word count for the live stats bar. */
export function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
