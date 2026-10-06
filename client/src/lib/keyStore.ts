/**
 * تخزين مفتاح المستخدم في المتصفح.
 *
 * المبدأ: المتصفح لا يملك مخزنًا آمنًا حقيقيًا للأسرار، لذلك نسعى إلى تقليل
 * سطح الخطر لا إلى ادّعاء الحماية المطلقة:
 *
 *   1. لا يُرسل المفتاح إلى أي جهة إلا `googleapis.com` — عبر خادم التطبيق فقط،
 *      ولا يظهر في أي حزمة عميل (لا `VITE_*` ولا ملفات عامة).
 *   2. لا يُكتب المفتاح نصًا صريحًا في `localStorage`، بل مشفّرًا بـ AES-GCM،
 *      ومفتاح التشفير نفسه مشتق من أصل الصفحة (origin) + ملح عشوائي مثبّت في
 *      الجهاز. هذا يمنع القراءة العابرة من أدوات المطوّر أو نسخة من ملفات
 *      المتصفح، **لكنه لا يحمي من هجوم XSS** يعمل داخل الصفحة.
 *   3. خيار «عدم التذكّر» متاح: يبقى المفتاح في الذاكرة فقط حتى إغلاق التبويب.
 *   4. يُمسح المفتاح فورًا عند الطلب من الإعدادات.
 *
 * ولهذا السبب نفسه نُبلّغ المستخدم بوضوح: المفتاح يبقى مسؤوليته، وأي مفتاح
 * يُشارَك أو يُرفع في مستودع عام يجب إبطاله من Google AI Studio.
 */

const STORAGE_KEY = 'sct.keystore.v1';
/** المفتاح القديم (نص صريح) — يُقرأ مرة واحدة للترقية ثم يُحذف. */
const LEGACY_KEY = 'sct.apikey.v1';

/**
 * الصيغ المقبولة شكلًا (مطابقة تمامًا للتحقق على الخادم في `server/gemini.ts`):
 *   - `AIza…` الصيغة الكلاسيكية
 *   - `AQ.…`  صيغة أحدث تُنتجها AI Studio / Vertex Express
 *
 * لا نفرض حدًا أدنى للطول: أطوال مفاتيح `AQ.` غير معلنة، وفرض طول خاطئ يرفض
 * مفتاحًا صحيحًا قبل تجربته. الحد الأدنى هنا (8 محارف) يمنع النص العابر فقط.
 */
export const API_KEY_PATTERN = /^(?:AIza[0-9A-Za-z_-]{18,}|AQ\.[0-9A-Za-z_.-]{4,})$/;
/** حد أدنى شكلي لمنع النص العابر أو النسخ الفارغ. */
export const API_KEY_MIN_LENGTH = 8;

const VERSION_ENCRYPTED = 'v1-enc';
const VERSION_PLAIN = 'v1-plain';
const PBKDF2_ITERATIONS = 120_000;

interface StoredEnvelope {
  v: string;
  salt?: string;
  iv?: string;
  data: string;
}

const subtle = (): SubtleCrypto | undefined =>
  typeof crypto !== 'undefined' && 'subtle' in crypto ? (crypto.subtle as SubtleCrypto) : undefined;

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i] ?? 0);
  return btoa(binary);
};

const fromBase64 = (value: string): Uint8Array => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const readRaw = (key: string): string | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeRaw = (key: string, value: string): void => {
  try {
    localStorage?.setItem(key, value);
  } catch {
    /* الحصة ممتلئة أو وضع خاص: نكمل بالذاكرة فقط */
  }
};

const removeRaw = (key: string): void => {
  try {
    localStorage?.removeItem(key);
  } catch {
    /* تجاهل */
  }
};

/** يستنتج مفتاح تشفير من أصل الصفحة + الملح (لا يخرج من الجهاز). */
async function deriveKey(salt: Uint8Array): Promise<CryptoKey | null> {
  const cryptoSubtle = subtle();
  if (!cryptoSubtle) return null;
  const origin = typeof location !== 'undefined' ? location.origin : 'unknown-origin';
  const encoder = new TextEncoder();
  const material = await cryptoSubtle.importKey('raw', encoder.encode(`sct|${origin}`), 'PBKDF2', false, ['deriveKey']);
  return cryptoSubtle.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** يقرأ المفتاح المحفوظ (يشمل ترقية المفتاح القديم غير المشفّر). */
export async function loadStoredApiKey(): Promise<string> {
  // 1) ترقية من الصيغة القديمة (نص صريح) إن وُجدت.
  const legacy = readRaw(LEGACY_KEY);
  if (legacy && legacy.trim().length > 0) {
    await saveStoredApiKey(legacy.trim());
    removeRaw(LEGACY_KEY);
    return legacy.trim();
  }

  const raw = readRaw(STORAGE_KEY);
  if (!raw) return '';

  let envelope: StoredEnvelope;
  try {
    envelope = JSON.parse(raw) as StoredEnvelope;
  } catch {
    removeRaw(STORAGE_KEY);
    return '';
  }

  if (envelope.v === VERSION_PLAIN) return envelope.data ?? '';

  if (envelope.v !== VERSION_ENCRYPTED || !envelope.salt || !envelope.iv) {
    removeRaw(STORAGE_KEY);
    return '';
  }

  try {
    const key = await deriveKey(fromBase64(envelope.salt));
    if (!key) return '';
    const plain = await subtle()!.decrypt(
      { name: 'AES-GCM', iv: fromBase64(envelope.iv) as unknown as BufferSource },
      key,
      fromBase64(envelope.data) as unknown as BufferSource,
    );
    return new TextDecoder().decode(plain);
  } catch {
    // ملح/سياق مختلف (مثلًا تغيّر الأصل): نعتبره تالفًا ونطلب المفتاح من جديد.
    removeRaw(STORAGE_KEY);
    return '';
  }
}

/** يحفظ المفتاح مشفّرًا. يعيد false إن تعذّر الحفظ (وضع خاص). */
export async function saveStoredApiKey(apiKey: string): Promise<boolean> {
  const trimmed = apiKey.trim();
  if (trimmed.length === 0) {
    clearStoredApiKey();
    return true;
  }

  const cryptoSubtle = subtle();
  if (!cryptoSubtle) {
    writeRaw(STORAGE_KEY, JSON.stringify({ v: VERSION_PLAIN, data: trimmed } satisfies StoredEnvelope));
    return true;
  }

  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(salt);
    if (!key) return false;
    const encrypted = await cryptoSubtle.encrypt(
      { name: 'AES-GCM', iv: iv as unknown as BufferSource },
      key,
      new TextEncoder().encode(trimmed) as unknown as BufferSource,
    );
    writeRaw(
      STORAGE_KEY,
      JSON.stringify({
        v: VERSION_ENCRYPTED,
        salt: toBase64(salt),
        iv: toBase64(iv),
        data: toBase64(new Uint8Array(encrypted)),
      } satisfies StoredEnvelope),
    );
    return true;
  } catch {
    return false;
  }
}

/** يمسح المفتاح المحفوظ (الصيغتين). */
export function clearStoredApiKey(): void {
  removeRaw(STORAGE_KEY);
  removeRaw(LEGACY_KEY);
}

/** هل يوجد مفتاح محفوظ على هذا الجهاز؟ (بلا فك تشفير) */
export const hasStoredApiKey = (): boolean => readRaw(STORAGE_KEY) !== null || readRaw(LEGACY_KEY) !== null;

/**
 * تحقّق صيغة سريع بلا شبكة — مطابق للقاعدة على الخادم.
 * يعيد `null` إذا كان المفتاح صالحًا شكلًا، أو نصًا عربيًا يشرح المشكلة.
 *
 * الصيغ المقبولة:
 *   `AIza…` الصيغة الكلاسيكية · `AQ.…` صيغة أحدث من AI Studio / Vertex Express.
 * رفض `AQ.` كان يمنع مستخدمين حقيقيين من استخدام التطبيق، لذا لا نعتمد على بادئة
 * واحدة. القرار النهائي يبقى لاستدعاء Google الفعلي.
 */
export function describeApiKeyProblem(raw: string): string | null {
  const key = raw.trim();
  if (key.length === 0) return 'أدخل مفتاح Gemini API أولًا.';
  if (/\s/.test(key)) return 'المفتاح يحتوي على مسافة أو سطر جديد. انسخه كاملًا دون فواصل.';
  if (key.startsWith('ya29.')) {
    return 'هذا رمز وصول مؤقت (OAuth) وليس مفتاح API. أنشئ مفتاحًا من Google AI Studio.';
  }
  if (key.length < API_KEY_MIN_LENGTH) {
    return `المفتاح قصير جدًا (${key.length} محرفًا). تأكد أنك نسخت المفتاح كاملًا.`;
  }
  if (!API_KEY_PATTERN.test(key)) {
    return 'صيغة المفتاح غير معروفة. مفاتيح Gemini تبدأ عادة بـ AIza أو AQ. وتتكون من أحرف وأرقام وشرطات ونقاط.';
  }
  return null;
}
