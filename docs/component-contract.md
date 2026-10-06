# عقد مكوّنات الواجهة (Component Contract) — المرجع الملزم

> هذا الملف مرجع داخلي لفريق التنفيذ. **لا يجوز تغيير أي اسم تصدير أو خاصية (prop)**
> إلا بتحديث هذا الملف. كل المكوّنات مكتوبة بـ TypeScript (strict) و React 19،
> وتستخدم Tailwind CSS v4 مع دعم RTL كأصل والتخطيط الإنجليزي عبر `dir` من الجذر.

## 1. الأصول المشتركة المتاحة بالفعل

| الوحدة | المسار | التصديرات |
| --- | --- | --- |
| الأنواع | `client/src/types.ts` | `AppSettings`, `RecorderMode`, `RecordingPhase`, `LiveSegment`, `SegmentStatus`, `HistoryItem`, `GlossaryEntry`, `TranslationResult`, `KeyTerm`, `PresetId`, `ToneId`, `ToastMessage`, `LanguageOption`, `SpeechVoiceOption`, `RecorderLevels`, `SegmentStatus` … |
| الثوابت | `client/src/constants.ts` | `LANGUAGE_OPTIONS`, `AUTO_LANGUAGE`, `findLanguage`, `directionFor`, `PRESET_OPTIONS`, `TONE_OPTIONS`, `findPreset`, `findTone`, `RECORDER_MODE_LABELS`, `DEFAULT_SETTINGS`, `SPEECH_RATE_MIN/MAX`, `VAD_SILENCE_MIN/MAX`, `MIN_SEGMENT_MS`, `MAX_SEGMENT_MS`, `HISTORY_LIMIT_MAX` |
| أدوات | `client/src/lib/utils.ts` | `cn`, `uid`, `clamp`, `formatDuration`, `formatBytes`, `formatClock`, `formatDateTime`, `relativeTime`, `truncate`, `isArabicText`, `detectDirection`, `copyToClipboard`, `downloadFile`, `base64ToBlob`, `vibrate`, `wordCount`, `safeJsonParse`, `mergeWithDefaults` |
| التخزين | `client/src/lib/storage.ts` | `buildExportBundle`, `buildPlainTextExport` |
| السجلات | `client/src/hooks/useToasts.ts` | نوع `ToastApi` |

**خط Cairo** للعربية، و**Plus Jakarta Sans** للإنجليزية — مضبوطة على `<html>` في `index.html`
عبر `--font-sans`/`--font-arabic`، فلا تكتب `font-family` يدويًا؛ استخدم `font-sans`.

### قواعد إلزامية لكل مكوّن
1. كل النصوص الظاهرة **بالعربية** (رسائل الخطأ، التسميات، التلميحات) وواجهة RTL افتراضيًا.
2. كل نص قابل للقراءة يجب أن يحترم اتجاهه: استخدم `dir={detectDirection(text)}` مع `style={{ unicodeBidi: 'plaintext' }}` في بطاقات النص.
3. المظهر: ألوان Slate/Indigo، دعم كامل للوضعين الفاتح والداكن. **استخدم صنف `dark:` فقط** حيث يلزم، مع خلفيات مثل `bg-white dark:bg-slate-900/70` وحدود `border-slate-200 dark:border-slate-700/60`، ونصوص `text-slate-800 dark:text-slate-100`.
4. الأيقونات من `lucide-react` فقط. الحركة من `motion/react` (`import { motion, AnimatePresence } from 'motion/react'`).
5. لا تنشئ أي مكوّن بخلاف ملفاتك المخصّصة في هذا العقد. لا تعدّل ملفات الآخرين.
6. الاتجاهات المنطقية فقط: `ps-*`/`pe-*`/`ms-*`/`me-*`/`start-*`/`end-*` — لا تستخدم `pl-`/`pr-`/`left-*`/`right-*`.
7. ممنوع استخدام `any` صريح، وممنوع `@ts-ignore`.
8. الأزرار يجب أن تحمل `type="button"` و`aria-label` عربيًا إذا كانت أيقونية فقط.

---

## 2. الملفات والتصديرات المطلوبة

### المهمة A — مكوّنات العرض الأساسية
| الملف | التصدير | النوع |
| --- | --- | --- |
| `components/ui/ToastStack.tsx` | `ToastStack` | React.FC |
| `components/ui/Spinner.tsx` | `Spinner`، `InlineDots` | React.FC |
| `components/ui/AudioVisualizer.tsx` | `AudioVisualizer` | React.FC |
| `components/RecorderCard.tsx` | `RecorderCard` | React.FC |

### المهمة B — مكوّنات النتائج
| الملف | التصدير | النوع |
| --- | --- | --- |
| `components/results/GhostButton.tsx` | `GhostButton`، `PrimaryButton`، `IconButton` | React.FC |
| `components/results/SourceCard.tsx` | `SourceCard` | React.FC |
| `components/results/TargetCard.tsx` | `TargetCard` | React.FC |
| `components/results/KeyTermsGrid.tsx` | `KeyTermsGrid` | React.FC |
| `components/results/ContextCard.tsx` | `ContextCard` | React.FC |
| `components/results/ResultPanel.tsx` | `ResultPanel` | React.FC |
| `components/results/LiveFeed.tsx` | `LiveFeed` (يصدّر أيضًا `LiveSegmentRow`) | React.FC |

### المهمة C — اللوحات والنوافذ
| الملف | التصدير | النوع |
| --- | --- | --- |
| `components/HistoryDrawer.tsx` | `HistoryDrawer` | React.FC |
| `components/SettingsModal.tsx` | `SettingsModal` | React.FC |
| `components/InstallGuide.tsx` | `InstallGuide` | React.FC |
| `components/GlossaryPanel.tsx` | `GlossaryPanel` | React.FC |

### المهمة D (المالك: القائد) — مكوّنات مكتوبة مسبقًا
`components/AppHeader.tsx` → `AppHeader`
`components/TranslationToolbar.tsx` → `TranslationToolbar`

---

## 3. توقيعات المكوّنات (Props) — عقد ثابت

```ts
// components/ui/ToastStack.tsx
export interface ToastStackProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}
export const ToastStack: React.FC<ToastStackProps>;

// components/ui/Spinner.tsx
export interface SpinnerProps { size?: number; className?: string; label?: string }
export interface InlineDotsProps { className?: string }
export const Spinner: React.FC<SpinnerProps>;
export const InlineDots: React.FC<InlineDotsProps>;

// components/ui/AudioVisualizer.tsx
export interface AudioVisualizerProps {
  levelsRef: React.RefObject<RecorderLevels>;
  active: boolean;
  /** 'bars' للترددات، 'wave' للموجة الزمنية، 'pulse' لحلقة نابضة */
  variant?: 'bars' | 'wave' | 'pulse';
  height?: number;
  className?: string;
  /** لون أساسي بصيغة CSS، الافتراضي indigo */
  accent?: string;
}
export const AudioVisualizer: React.FC<AudioVisualizerProps>;

// components/RecorderCard.tsx
export interface RecorderCardProps {
  mode: RecorderMode;
  phase: RecordingPhase;
  isRecording: boolean;
  elapsedMs: number;
  segmentElapsedMs: number;
  levelsRef: React.RefObject<RecorderLevels>;
  recorderError: string | null;
  supported: boolean;
  mimeType: string;
  devices: AudioDeviceSummary[];
  selectedDeviceId: string;
  vadSilenceMs: number;
  minSegmentMs: number;
  onSelectDevice: (deviceId: string) => void;
  onToggle: () => void;
  onPressStart: () => void;
  onPressEnd: () => void;
  onCancel: () => void;
  onSubmitAudio: (batch: { base64: string; mimeType: string; durationMs: number; audioUrl: string }) => void;
  onError: (message: string) => void;
  onSensitivityChange: (silenceMs: number) => void;
  onClearError: () => void;
}
export const RecorderCard: React.FC<RecorderCardProps>;

// components/results/*
export interface SourceCardProps {
  transcription: string;
  sourceLangLabel: string;
  sourceLangCode: string;
  audioUrl?: string;
  kind: 'text' | 'audio';
  durationMs?: number;
  onSpeak: () => void;
  speaking: boolean;
  speechSupported: boolean;
}
export interface TargetCardProps {
  translation: string;
  targetLangLabel: string;
  targetLangCode: string;
  audioUrl?: string;
  onSpeak: () => void;
  speaking: boolean;
  speechSupported: boolean;
  onCopy: () => void;
  onStar: () => void;
  onShare: () => void;
  starred: boolean;
}
export interface KeyTermsGridProps { terms: KeyTerm[]; targetLangLabel: string }
export interface ContextCardProps {
  analysis: string;
  model: string;
  latencyMs: number;
  attempts: number;
  keySource: 'user' | 'server';
  presetLabel: string;
  toneLabel: string;
  detectedLanguage: string;
}
export interface ResultPanelProps {
  result: TranslationResult | null;
  processing: boolean;
  onCopySource: () => void;
  onCopyTranslation: () => void;
  onStar: () => void;
  onShare: () => void;
  starred: boolean;
  onSpeakSource: () => void;
  onSpeakTarget: () => void;
  speakingId: string | null;
  speechSupported: boolean;
  sourceLangLabel: string;
  targetLangLabel: string;
  targetLangCode: string;
}
export interface LiveFeedProps {
  segments: LiveSegment[];
  onReplay: (segment: LiveSegment) => void;
  onRetry: (segment: LiveSegment) => void;
  onClear: () => void;
  onCopySegment: (segment: LiveSegment) => void;
  onSpeakSegment: (segment: LiveSegment) => void;
  isRecording: boolean;
  targetLangLabel: string;
}

// components/HistoryDrawer.tsx
export interface HistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  items: HistoryItem[];
  onToggleFavorite: (id: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onCopy: (item: HistoryItem) => void;
  onSpeak: (item: HistoryItem) => void;
  onSelect: (item: HistoryItem) => void;
  onExportJson: () => void;
  onExportText: () => void;
  speakingId: string | null;
  speechSupported: boolean;
}

// components/SettingsModal.tsx
export interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (patch: Partial<AppSettings>) => void;
  serverKeyConfigured: boolean;
  statusError: string | null;
  voices: SpeechVoiceOption[];
  onTestVoice: (languageCode: string) => void;
  onValidateKey: (apiKey: string) => Promise<{ valid: boolean; reason?: string }>;
  /** زر «تصفير كل البيانات» في تبويب البيانات — يستدعي تأكيدًا داخل App. */
  onResetData: () => void;
}

// components/InstallGuide.tsx
export interface InstallGuideProps { open: boolean; onClose: () => void }

// components/GlossaryPanel.tsx
export interface GlossaryPanelProps {
  entries: GlossaryEntry[];
  onDelete: (id: string) => void;
  onClear: () => void;
  onSpeak: (entry: GlossaryEntry) => void;
}
```

---

## 4. سلوك تفصيلي مطلوب

### RecorderCard (الأهم)
- ثلاثة أنماط (`RECORDER_MODE_LABELS`): `toggle`، `hold`، `continuous`. النمط يأتي من الأب (`mode`).
- `toggle`: زر كبير واحد → `onToggle()`.
- `hold`: نفس الزر مع `onPointerDown={onPressStart}` و`onPointerUp/onPointerLeave/onPointerCancel={onPressEnd}`، مع `onContextMenu` مانع للقائمة، و`touch-action: none`.
- `continuous`: زر بدء/إيقاف عبر `onToggle()` + شارة "بث مباشر" نابضة + عدّاد للمقطع الحالي (`segmentElapsedMs`) وبطاقة إرشاد تشرح أن المقطع يُرسل تلقائيًا عند السكوت.
- `AudioVisualizer` نشط أثناء التسجيل، مع `pulse` خلف الزر.
- مؤشر زمن التسجيل `formatDuration(elapsedMs)` بخط `tabular-nums`.
- منتقي الميكروفون: `<select>` بقائمة `devices` (يظهر فقط إذا `devices.length > 1`).
- شريط حساسية VAD يظهر في نمط `continuous` فقط: مدى `VAD_SILENCE_MIN..VAD_SILENCE_MAX` خطوة 100، القيمة الحالية `vadSilenceMs`، يستدعي `onSensitivityChange`.
- رفع ملف صوتي: `<input type="file" accept="audio/*" hidden>`؛ عند الاختيار: تحقق من الحجم ≤ 45MB، أنشئ `URL.createObjectURL(file)`, ثم `blobToBase64(file)` (من `lib/utils`) واستدعِ `onSubmitAudio({ base64, mimeType: file.type || 'audio/webm', durationMs: 0, audioUrl })`.
- عرض `recorderError` في تنبيه أحمر مع زر "حسنًا" يستدعي `onClearError`.
- إذا `!supported` اعرض تحذيرًا يمنع التسجيل.
- استخدم `motion` لحلقة نابضة أثناء التسجيل، واحترم `prefers-reduced-motion` عبر `useMediaQuery('(prefers-reduced-motion: reduce)')`.

### ResultPanel
- إذا `processing` → هيكل تحميل (skeleton) مع `Spinner` ورسالة "جارٍ التحليل السياقي للصوت…".
- إذا لا نتيجة ولا معالجة → حالة فارغة أنيقة تشرح الخطوات الثلاث (سجّل، اختر المجال، استلم الترجمة).
- عند وجود نتيجة: `SourceCard` + `TargetCard` جنبًا إلى جنب على الشاشات الواسعة (`lg:grid-cols-2`) ومكدّستان على الجوال، ثم `KeyTermsGrid` (تُخفى إذا لا مصطلحات) ثم `ContextCard`.
- شريط علوي للنتيجة: اللغة المكتشفة، الموديل، زمن الاستجابة `formatDuration(latencyMs)`، عدد المحاولات إذا > 1، ومصدر المفتاح (مفتاحك/مفتاح الخادم).

### LiveFeed
- قائمة `segments` مرتّبة تنازليًا زمنيًا (الأحدث في الأعلى) مع تمرير تلقائي إلى الأعلى عند الإضافة، وعدّاد إجمالي المقاطع.
- كل صف: رقم المقطع، حالة (`pending`/`recording`/`processing`/`completed`/`error`) بألوان مختلفة، الوقت `formatClock`، مدة البث، نص المصدر ثم الترجمة، أزرار: إعادة تشغيل الصوت (`audioUrl` عبر `<audio controls>` مدمج أو زر)، إعادة المحاولة عند الخطأ، نسخ، نطق.
- زر "مسح البث" يستدعي `onClear`.
- عند عدم وجود مقاطع: رسالة تشرح تفعيل النمط المستمر.

### HistoryDrawer
- `AnimatePresence` + انزلاق من جهة النهاية (`end-0`) مع طبقة تعتيم، إغلاق بمفتاح Escape وبالنقر على الطبقة، ومنع تمرير الصفحة أثناء الفتح.
- بحث نصي فوري (المصدر + الترجمة + المصطلحات) مع تمييز عدد النتائج، ومرشّح "المفضلة فقط" + مرشّح المجال.
- كل عنصر: الوقت النسبي `relativeTime`، شارة اللغة/المجال/النمط، مقتطف، أزرار: نسخ، نطق، نجمة، حذف، و"استخدام" يستدعي `onSelect`.
- تذييل: تصدير JSON، تصدير نصي، مسح الكل (بتأكيد داخلي بسيط `confirm`).

### SettingsModal
- تبويبات: الاتصال (المفتاح)، الصوت، الترجمة، البيانات.
- حقل المفتاح `type="password"` مع زر إظهار/إخفاء، تحقق فوري بالصيغة (`AIza...`) قبل الإرسال، وزر "تحقق من المفتاح" يستدعي `onValidateKey` ويعرض النتيجة نجاحًا/فشلًا بالعربية. إن كان `serverKeyConfigured` اعرض شارة "مفتاح الخادم متاح" مع زر "تحقق من مفتاح الخادم" الذي يستدعي `onValidateKey('env')`.
- مفتاح تفعيل `rememberApiKey` مع تحذير واضح عند تعطيله.
- منزلقات: `vadSilenceMs` (700–3000)، `vadThreshold` (0.005–0.25، اعرض كنسبة مئوية)، `speechRate` (0.7–1.4)، `speechVolume` (0–1)، `historyLimit` (20–500).
- اختيار الصوت من `voices` مع زر "تجربة الصوت" → `onTestVoice(languageCode)`.
- تبديلات: `autoSpeak`، `confirmDestructive`، والمظهر (`theme`)، واللغة الافتراضية للتطبيق (`locale`).
- كل تغيير يُبَثّ مباشرة عبر `onSave({ ... })` (لا حاجة لزر حفظ منفصل، لكن اعرض زر "إغلاق").
- زر "تصفير البيانات" يستدعي `onSave({})`? لا — استخدم `onClose` فقط ولا تحذف البيانات من هنا؛ اكتفِ بإشعار أن الحذف يتم من السجل.

### InstallGuide
- كشف المنصة: iOS/Safari، Android، سطح المكتب.
- iOS: خطوات "المشاركة → إضافة إلى الشاشة الرئيسية".
- Android/سطح المكتب: التقاط `beforeinstallprompt` داخل المكوّن (`useEffect` مع `event.preventDefault()`)، وزر "تثبيت الآن" يستدعي `prompt()`، وإن لم يتوفر الحدث اعرض خطوات يدوية (قائمة المتصفح → تثبيت التطبيق).
- أقسام إضافية: تعليمات تغليف APK عبر PWABuilder (رابط https://www.pwabuilder.com) وملاحظات العمل دون اتصال.

### GlossaryPanel
- شبكة بطاقات مصطلحات مجمّعة من `entries` مع عدّاد التكرار وشارة المجال واللغتين، بحث فوري، وفرز (الأحدث/الأكثر تكرارًا/أبجدي).
- أزرار: نسخ، نطق، حذف، ومسح الكل بتأكيد.

### الألوان والحركة (موحّدة لكل المكوّنات)
- الأساسي: `indigo-600` للوضع الفاتح و`indigo-500` للداكن، مع `shadow-indigo-500/25`.
- الزجاجية: `backdrop-blur-xl bg-white/80 dark:bg-slate-900/70`.
- الحدود: `rounded-2xl` للبطاقات و`rounded-xl` للأزرار.
- الانتقالات: `transition-colors duration-200` أو `motion` مع `initial/animate/exit` قصيرة (0.15–0.3s).
