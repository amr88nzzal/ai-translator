/** Static catalogs: languages, presets, tones and safe defaults. */
import type { AppSettings, LanguageOption, PresetOption, ToneOption } from './types';

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: 'ar', nativeLabel: 'العربية', englishLabel: 'Arabic', short: 'AR', direction: 'rtl', speechTag: 'ar-SA', voiceHints: ['ar-sa', 'ar-eg', 'ar'] },
  { code: 'en', nativeLabel: 'English', englishLabel: 'English', short: 'EN', direction: 'ltr', speechTag: 'en-US', voiceHints: ['en-us', 'en-gb', 'en'] },
  { code: 'fr', nativeLabel: 'Français', englishLabel: 'French', short: 'FR', direction: 'ltr', speechTag: 'fr-FR', voiceHints: ['fr-fr', 'fr'] },
  { code: 'es', nativeLabel: 'Español', englishLabel: 'Spanish', short: 'ES', direction: 'ltr', speechTag: 'es-ES', voiceHints: ['es-es', 'es'] },
  { code: 'de', nativeLabel: 'Deutsch', englishLabel: 'German', short: 'DE', direction: 'ltr', speechTag: 'de-DE', voiceHints: ['de-de', 'de'] },
  { code: 'tr', nativeLabel: 'Türkçe', englishLabel: 'Turkish', short: 'TR', direction: 'ltr', speechTag: 'tr-TR', voiceHints: ['tr-tr', 'tr'] },
  { code: 'ru', nativeLabel: 'Русский', englishLabel: 'Russian', short: 'RU', direction: 'ltr', speechTag: 'ru-RU', voiceHints: ['ru-ru', 'ru'] },
  { code: 'ur', nativeLabel: 'اردو', englishLabel: 'Urdu', short: 'UR', direction: 'rtl', speechTag: 'ur-PK', voiceHints: ['ur-pk', 'ur'] },
  { code: 'fa', nativeLabel: 'فارسی', englishLabel: 'Persian', short: 'FA', direction: 'rtl', speechTag: 'fa-IR', voiceHints: ['fa-ir', 'fa'] },
  { code: 'hi', nativeLabel: 'हिन्दी', englishLabel: 'Hindi', short: 'HI', direction: 'ltr', speechTag: 'hi-IN', voiceHints: ['hi-in', 'hi'] },
  { code: 'zh', nativeLabel: '中文', englishLabel: 'Chinese', short: 'ZH', direction: 'ltr', speechTag: 'zh-CN', voiceHints: ['zh-cn', 'zh'] },
  { code: 'ja', nativeLabel: '日本語', englishLabel: 'Japanese', short: 'JA', direction: 'ltr', speechTag: 'ja-JP', voiceHints: ['ja-jp', 'ja'] },
  { code: 'it', nativeLabel: 'Italiano', englishLabel: 'Italian', short: 'IT', direction: 'ltr', speechTag: 'it-IT', voiceHints: ['it-it', 'it'] },
  { code: 'pt', nativeLabel: 'Português', englishLabel: 'Portuguese', short: 'PT', direction: 'ltr', speechTag: 'pt-BR', voiceHints: ['pt-br', 'pt'] },
  { code: 'ko', nativeLabel: '한국어', englishLabel: 'Korean', short: 'KO', direction: 'ltr', speechTag: 'ko-KR', voiceHints: ['ko-kr', 'ko'] },
  { code: 'id', nativeLabel: 'Indonesia', englishLabel: 'Indonesian', short: 'ID', direction: 'ltr', speechTag: 'id-ID', voiceHints: ['id-id', 'id'] },
  { code: 'he', nativeLabel: 'עברית', englishLabel: 'Hebrew', short: 'HE', direction: 'rtl', speechTag: 'he-IL', voiceHints: ['he-il', 'he'] },
  { code: 'nl', nativeLabel: 'Nederlands', englishLabel: 'Dutch', short: 'NL', direction: 'ltr', speechTag: 'nl-NL', voiceHints: ['nl-nl', 'nl'] },
  { code: 'pl', nativeLabel: 'Polski', englishLabel: 'Polish', short: 'PL', direction: 'ltr', speechTag: 'pl-PL', voiceHints: ['pl-pl', 'pl'] },
  { code: 'sv', nativeLabel: 'Svenska', englishLabel: 'Swedish', short: 'SV', direction: 'ltr', speechTag: 'sv-SE', voiceHints: ['sv-se', 'sv'] },
];

export const AUTO_LANGUAGE: LanguageOption = {
  code: 'auto',
  nativeLabel: 'كشف تلقائي',
  englishLabel: 'Auto-detect',
  short: 'AUTO',
  direction: 'ltr',
  speechTag: 'ar-SA',
};

export const findLanguage = (code: string): LanguageOption | undefined =>
  code === 'auto' ? AUTO_LANGUAGE : LANGUAGE_OPTIONS.find((option) => option.code === code);

export const directionFor = (code: string): 'rtl' | 'ltr' => findLanguage(code)?.direction ?? 'ltr';

export const PRESET_OPTIONS: PresetOption[] = [
  { id: 'general', labelAr: 'عام', labelEn: 'General', descriptionAr: 'ترجمة يومية متوازنة بلا تخصص دقيق.', emoji: '🌐' },
  { id: 'medical', labelAr: 'طبي', labelEn: 'Medical', descriptionAr: 'مصطلحات سريرية دقيقة وتشخيصية.', emoji: '🩺' },
  { id: 'tech', labelAr: 'برمجي/تقني', labelEn: 'Programming & Tech', descriptionAr: 'يبقي أسماء التقنيات والأوامر بالإنجليزية.', emoji: '💻' },
  { id: 'legal', labelAr: 'قانوني', labelEn: 'Legal', descriptionAr: 'صياغة تعاقدية رسمية ومصطلحات معتمدة.', emoji: '⚖️' },
  { id: 'business', labelAr: 'أعمال', labelEn: 'Business', descriptionAr: 'بريد إداري وتقارير تنفيذية مهنية.', emoji: '📈' },
  { id: 'casual', labelAr: 'محادثة', labelEn: 'Casual', descriptionAr: 'عامية طبيعية وروح النكتة والانفعال.', emoji: '💬' },
  { id: 'tourism', labelAr: 'سياحة', labelEn: 'Tourism', descriptionAr: 'أسلوب ودود مع شرح الأماكن والأطباق.', emoji: '🧭' },
  { id: 'academic', labelAr: 'أكاديمي', labelEn: 'Academic', descriptionAr: 'صياغة بحثية رصينة ومصطلحات علمية.', emoji: '🎓' },
];

export const TONE_OPTIONS: ToneOption[] = [
  { id: 'professional', labelAr: 'مهنية', labelEn: 'Professional', descriptionAr: 'رسمية واثقة بجمل مكتملة.', emoji: '👔' },
  { id: 'casual', labelAr: 'عفوية', labelEn: 'Casual', descriptionAr: 'قريبة من الحديث اليومي.', emoji: '🙂' },
  { id: 'academic', labelAr: 'أكاديمية', labelEn: 'Academic', descriptionAr: 'مفردات دقيقة وتراكيب رصينة.', emoji: '📚' },
  { id: 'concise', labelAr: 'موجزة', labelEn: 'Concise', descriptionAr: 'مباشرة بلا حشو مع كامل المعنى.', emoji: '⚡' },
];

export const findPreset = (id: string): PresetOption =>
  PRESET_OPTIONS.find((preset) => preset.id === id) ?? PRESET_OPTIONS[0]!;

export const findTone = (id: string): ToneOption => TONE_OPTIONS.find((tone) => tone.id === id) ?? TONE_OPTIONS[0]!;

export const RECORDER_MODE_LABELS = {
  toggle: { ar: 'تشغيل/إيقاف', en: 'Toggle', descriptionAr: 'اضغط للبدء، واضغط مرة أخرى للإيقاف والترجمة.', emoji: '⏯️' },
  hold: { ar: 'اضغط واستمر', en: 'Push-to-Hold', descriptionAr: 'استمر بالضغط أثناء الكلام، واتركه للإرسال فورًا.', emoji: '🎙️' },
  continuous: { ar: 'بث مباشر', en: 'Continuous Live', descriptionAr: 'مستمع مستمر يقطّع الكلام تلقائيًا عند السكوت.', emoji: '📡' },
} as const;

export const SPEECH_RATE_MIN = 0.7;
export const SPEECH_RATE_MAX = 1.4;
export const VAD_SILENCE_MIN = 700;
export const VAD_SILENCE_MAX = 3000;
export const MIN_SEGMENT_MS = 450;
export const MAX_SEGMENT_MS = 60_000;
export const HISTORY_LIMIT_MAX = 500;

export const DEFAULT_SETTINGS: AppSettings = {
  userApiKey: '',
  theme: 'dark',
  locale: 'ar',
  defaultSourceLang: 'auto',
  defaultTargetLang: 'en',
  defaultPreset: 'general',
  defaultTone: 'professional',
  defaultRecorderMode: 'toggle',
  vadSilenceMs: 1200,
  vadThreshold: 0.035,
  speechRate: 1,
  speechVolume: 1,
  speechVoiceUri: '',
  autoSpeak: false,
  minSegmentMs: MIN_SEGMENT_MS,
  confirmDestructive: true,
  historyLimit: 150,
};

export const STORAGE_KEYS = {
  settings: 'sct.settings.v1',
  history: 'sct.history.v1',
  glossary: 'sct.glossary.v1',
  favorites: 'sct.favorites.v1',
  theme: 'sct.theme.v1',
  apiKey: 'sct.apikey.v1',
  lastSession: 'sct.session.v1',
} as const;

export const API_ROUTES = {
  health: '/api/health',
  status: '/api/status',
  translateText: '/api/translate-text',
  translateAudio: '/api/translate-audio',
  validateKey: '/api/validate-key',
} as const;

export const AUDIO_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/wav',
] as const;

export const MAX_UPLOAD_BYTES = 45 * 1024 * 1024;
