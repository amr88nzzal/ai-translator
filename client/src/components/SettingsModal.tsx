/**
 * نافذة الإعدادات — أربعة تبويبات: الاتصال، الصوت، الترجمة، البيانات.
 *
 * كل تغيير يُبَثّ مباشرة إلى الأب عبر `onSave` (لا يوجد زر حفظ منفصل)، بينما
 * يحتفظ المكوّن بحالة محلية لحقل المفتاح ونتيجة التحقق فقط.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BadgeCheck,
  Check,
  CircleAlert,
  CircleCheck,
  Database,
  Eraser,
  Eye,
  EyeOff,
  FileText,
  Gauge,
  Globe,
  HardDrive,
  Info,
  KeyRound,
  LoaderCircle,
  Palette,
  Server,
  SlidersHorizontal,
  Sparkles,
  Star,
  Upload,
  Volume1,
  Volume2,
  X,
} from 'lucide-react';
import {
  SPEECH_RATE_MAX,
  SPEECH_RATE_MIN,
  VAD_SILENCE_MAX,
  VAD_SILENCE_MIN,
  findLanguage,
} from '@/constants';
import type { AppLocale, AppSettings, SpeechVoiceOption, ThemeMode } from '@/types';
import type { AuthMode } from '@shared/api-contract';
import { describeApiKeyProblem } from '@/lib/keyStore';
import { cn } from '@/lib/utils';

export interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (patch: Partial<AppSettings>) => void;
  serverKeyConfigured: boolean;
  /** `user` = مفتاح المستخدم إلزامي، `hybrid` = يوجد مفتاح خادم كخطة بديلة فقط. */
  authMode: AuthMode;
  /** هل المفتاح محفوظ (مشفّرًا) على هذا الجهاز؟ */
  hasPersistedKey: boolean;
  statusError: string | null;
  voices: SpeechVoiceOption[];
  onTestVoice: (languageCode: string) => void;
  onValidateKey: (apiKey: string) => Promise<{ valid: boolean; reason?: string }>;
  /** يحذف المفتاح من هذا الجهاز ويعيد فتح بوابة الإدخال. */
  onForgetKey: () => void;
  /** زر «تصفير كل البيانات» في تبويب البيانات — يستدعي تأكيدًا داخل App. */
  onResetData: () => void;
}

type TabId = 'connection' | 'voice' | 'translation' | 'data';

type VerifyState =
  | { status: 'ok'; message: string }
  | { status: 'fail'; message: string }
  | null;

const HISTORY_LIMIT_MIN = 20;
const HISTORY_LIMIT_MAX = 500;

const TABS: ReadonlyArray<{ id: TabId; label: string; icon: typeof KeyRound }> = [
  { id: 'connection', label: 'الاتصال', icon: KeyRound },
  { id: 'voice', label: 'الصوت', icon: Volume2 },
  { id: 'translation', label: 'الترجمة', icon: SlidersHorizontal },
  { id: 'data', label: 'البيانات', icon: Database },
];

const THEME_OPTIONS: ReadonlyArray<{ id: ThemeMode; label: string }> = [
  { id: 'light', label: 'فاتح' },
  { id: 'dark', label: 'داكن' },
  { id: 'system', label: 'النظام' },
];

const LOCALE_OPTIONS: ReadonlyArray<{ id: AppLocale; label: string }> = [
  { id: 'ar', label: 'العربية (RTL)' },
  { id: 'en', label: 'English (LTR)' },
];

const fieldClass =
  'w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm text-slate-800 outline-none transition-colors duration-200 placeholder:text-slate-400 focus-visible:border-brand-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100';

const sectionClass = 'rounded-2xl border border-slate-200/80 bg-white/60 p-3.5 dark:border-slate-700/60 dark:bg-slate-900/40';

const secondaryButtonClass =
  'inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-[11px] font-bold text-slate-700 transition-colors duration-200 hover:border-brand-400 hover:text-brand-700 disabled:opacity-40 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-200';

interface SwitchRowProps {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}

const SwitchRow = ({ id, label, description, checked, onChange }: SwitchRowProps): React.JSX.Element => (
  <div className="flex items-start justify-between gap-3">
    <div className="min-w-0">
      <label htmlFor={id} className="block text-sm font-bold text-slate-800 dark:text-slate-100">
        {label}
      </label>
      {description ? (
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>
      ) : null}
    </div>
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative mt-0.5 h-6 w-11 shrink-0 rounded-full border transition-colors duration-200',
        checked ? 'border-brand-500 bg-brand-600' : 'border-slate-300 bg-slate-200 dark:border-slate-600 dark:bg-slate-700',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 size-5 rounded-full bg-white shadow-sm transition-all duration-200',
          checked ? 'start-[1.375rem]' : 'start-0.5',
        )}
        aria-hidden
      />
    </button>
  </div>
);

interface SliderRowProps {
  id: string;
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}

const SliderRow = ({ id, label, hint, value, min, max, step, display, onChange }: SliderRowProps): React.JSX.Element => (
  <div>
    <div className="flex items-baseline justify-between gap-3">
      <label htmlFor={id} className="text-sm font-bold text-slate-800 dark:text-slate-100">
        {label}
      </label>
      <span className="numeric rounded-lg bg-slate-900/5 px-2 py-0.5 text-[11px] font-bold text-slate-600 dark:bg-white/10 dark:text-slate-200">
        {display}
      </span>
    </div>
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="mt-2 w-full cursor-pointer accent-brand-600"
    />
    <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{hint}</p>
  </div>
);

interface VerifyFeedbackProps {
  state: VerifyState;
  className?: string;
}

/** نتيجة التحقق من المفتاح، بالعربية، بنجاح أخضر أو فشل أحمر. */
const VerifyFeedback = ({ state, className }: VerifyFeedbackProps): React.JSX.Element | null => {
  if (!state) return null;
  const ok = state.status === 'ok';
  return (
    <p
      role="status"
      className={cn(
        'flex items-start gap-2 rounded-xl border px-3 py-2 text-[11px] font-semibold leading-relaxed',
        ok
          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          : 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
        className,
      )}
    >
      {ok ? <Check className="mt-0.5 size-4 shrink-0" aria-hidden /> : <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
      {state.message}
    </p>
  );
};

export const SettingsModal = ({
  open,
  onClose,
  settings,
  onSave,
  serverKeyConfigured,
  authMode,
  hasPersistedKey,
  statusError,
  voices,
  onTestVoice,
  onValidateKey,
  onForgetKey,
  onResetData,
}: SettingsModalProps): React.JSX.Element => {
  const [tab, setTab] = useState<TabId>('connection');
  const [keyDraft, setKeyDraft] = useState(settings.userApiKey);
  const [showKey, setShowKey] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verify, setVerify] = useState<VerifyState>(null);
  const [serverVerifying, setServerVerifying] = useState(false);
  const [serverVerify, setServerVerify] = useState<VerifyState>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const keyFieldId = useId();
  const wasOpenRef = useRef(open);

  /* إعادة ضبط الحالة المحلية عند الانتقال من مغلق إلى مفتوح فقط (بدون تعديل أي prop). */
  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;
    if (!open || wasOpen) return;
    setKeyDraft(settings.userApiKey);
    setVerify(null);
    setServerVerify(null);
    setShowKey(false);
    setTab('connection');
  }, [open, settings.userApiKey]);

  /* Escape للإغلاق + قفل تمرير الصفحة + تركيز اللوحة. */
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    panelRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  const defaultTarget = findLanguage(settings.defaultTargetLang) ?? findLanguage('en');
  const voiceOptions = useMemo(() => {
    const tag = (defaultTarget?.speechTag ?? 'en-US').toLowerCase();
    const prefix = tag.slice(0, 2);
    return [...voices].sort((a, b) => {
      const score = (voice: SpeechVoiceOption): number => {
        const lang = voice.lang.toLowerCase();
        if (lang === tag) return 0;
        if (lang.startsWith(prefix)) return 1;
        return 2;
      };
      return score(a) - score(b);
    });
  }, [voices, defaultTarget]);

  // نستخدم نفس قاعدة التحقق المستخدمة في شاشة البداية والخادم (تدعم AIza و AQ.).
  const keyProblem = keyDraft.trim().length > 0 ? describeApiKeyProblem(keyDraft) : null;
  const keyFormatInvalid = keyProblem !== null;
  const testLanguageCode = settings.defaultTargetLang === 'auto' ? 'en' : settings.defaultTargetLang;

  const runVerify = async (value: string, source: 'user' | 'server'): Promise<void> => {
    const setBusy = source === 'user' ? setVerifying : setServerVerifying;
    const setResult = source === 'user' ? setVerify : setServerVerify;
    setBusy(true);
    setResult(null);
    try {
      const outcome = await onValidateKey(value);
      if (outcome.valid) {
        setResult({
          status: 'ok',
          message:
            source === 'user'
              ? 'تم التحقق من المفتاح بنجاح — أصبح جاهزًا للترجمة.'
              : 'مفتاح الخادم يعمل بشكل صحيح.',
        });
      } else {
        setResult({
          status: 'fail',
          message: outcome.reason?.trim() || 'رفض Gemini هذا المفتاح. تأكد من نسخه كاملًا ومن صلاحياته.',
        });
      }
    } catch (error) {
      setResult({
        status: 'fail',
        message: error instanceof Error ? error.message : 'تعذّر الاتصال بالخدمة أثناء التحقق من المفتاح.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyUserKey = async (): Promise<void> => {
    const value = keyDraft.trim();
    if (!value) {
      setVerify({ status: 'fail', message: 'أدخل مفتاح Gemini أولًا.' });
      return;
    }
    const problem = describeApiKeyProblem(value);
    if (problem) {
      setVerify({ status: 'fail', message: problem });
      return;
    }
    await runVerify(value, 'user');
  };

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" dir="rtl">
          <motion.button
            type="button"
            aria-label="إغلاق الإعدادات"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 h-full w-full cursor-default bg-slate-950/55 backdrop-blur-sm"
          />

          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="إعدادات التطبيق"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="glass-panel relative z-10 flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl shadow-2xl shadow-slate-950/40 outline-none sm:rounded-3xl"
          >
            <header className="flex items-start justify-between gap-3 border-b border-slate-200/70 px-4 py-3.5 dark:border-slate-800/70">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-base font-extrabold text-slate-900 dark:text-white">
                  <SlidersHorizontal className="size-5 text-brand-600 dark:text-brand-300" aria-hidden />
                  الإعدادات
                </h2>
                <p className="mt-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  كل تغيير يُحفظ ويُطبَّق فورًا على هذا الجهاز.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="إغلاق الإعدادات"
                title="إغلاق"
                className="grid size-9 place-items-center rounded-xl border border-slate-200 bg-white/70 text-slate-600 transition-colors duration-200 hover:text-brand-700 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-300"
              >
                <X className="size-4" aria-hidden />
              </button>
            </header>

            <div
              role="tablist"
              aria-label="أقسام الإعدادات"
              className="no-scrollbar flex gap-1.5 overflow-x-auto border-b border-slate-200/70 px-3 py-2.5 dark:border-slate-800/70"
            >
              {TABS.map((entry) => {
                const Icon = entry.icon;
                const active = tab === entry.id;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(entry.id)}
                    className={cn(
                      'flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-colors duration-200',
                      active
                        ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/25'
                        : 'text-slate-600 hover:text-brand-700 dark:text-slate-300 dark:hover:text-brand-200',
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                    {entry.label}
                  </button>
                );
              })}
            </div>

            <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-4 py-4">
              {statusError ? (
                <p className="flex items-start gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-[11px] font-semibold leading-relaxed text-amber-800 dark:text-amber-200">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {statusError}
                </p>
              ) : null}

              {tab === 'connection' ? (
                <>
                  <section className={sectionClass}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white">
                        <KeyRound className="size-4 text-brand-600 dark:text-brand-300" aria-hidden />
                        مفتاح Gemini الخاص بك
                      </h3>
                      {settings.userApiKey.trim().length > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                          <CircleCheck className="size-3.5" aria-hidden />
                          مفتاح محفوظ حاليًا
                        </span>
                      ) : null}
                    </div>

                    <label htmlFor={keyFieldId} className="mt-3 block text-[11px] font-bold text-slate-500 dark:text-slate-400">
                      المفتاح — يُحفظ مشفّرًا (AES-GCM) على جهازك، ولا يُرسل إلى أي جهة غير Google
                    </label>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="relative min-w-0 flex-1">
                        <input
                          id={keyFieldId}
                          type={showKey ? 'text' : 'password'}
                          value={keyDraft}
                          autoComplete="off"
                          spellCheck={false}
                          dir="ltr"
                          onChange={(event) => {
                            // لا نكتب المفتاح في الإعدادات مع كل ضغطة: الحفظ يتم عند
                            // «تحقق من المفتاح» فقط، عبر مخزن المفاتيح المشفّر.
                            setKeyDraft(event.target.value);
                            setVerify(null);
                          }}
                          placeholder="AIza… أو AQ.…"
                          aria-label="مفتاح Gemini API"
                          aria-invalid={keyFormatInvalid}
                          className={cn(fieldClass, 'pe-10 font-mono tracking-tight')}
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey((current) => !current)}
                          aria-label={showKey ? 'إخفاء المفتاح' : 'إظهار المفتاح'}
                          title={showKey ? 'إخفاء' : 'إظهار'}
                          className="absolute end-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-slate-500 transition-colors duration-200 hover:text-brand-700 dark:text-slate-400"
                        >
                          {showKey ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleVerifyUserKey()}
                        disabled={verifying || keyDraft.trim().length === 0}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2.5 text-xs font-bold text-white shadow-sm shadow-brand-500/25 transition-colors duration-200 hover:bg-brand-500 disabled:opacity-40"
                      >
                        {verifying ? (
                          <LoaderCircle className="size-4 animate-spin" aria-hidden />
                        ) : (
                          <BadgeCheck className="size-4" aria-hidden />
                        )}
                        {verifying ? 'جارٍ التحقق…' : 'تحقق من المفتاح'}
                      </button>
                    </div>

                    {keyFormatInvalid ? (
                      <p className="mt-1.5 flex items-start gap-1.5 text-[11px] font-bold text-amber-700 dark:text-amber-300">
                        <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        <span>{keyProblem}</span>
                      </p>
                    ) : null}

                    <VerifyFeedback state={verify} className="mt-2.5" />

                    <p className="mt-2.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                      للحصول على مفتاح مجاني: افتح Google AI Studio ثم «Get API key» وانسخ المفتاح هنا.
                    </p>
                  </section>

                  <section className={sectionClass}>
                    <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white">
                      <HardDrive className="size-4 text-brand-600 dark:text-brand-300" aria-hidden />
                      كيف يُخزَّن المفتاح؟
                    </h3>
                    <ul className="mt-2 space-y-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                      <li className="flex gap-2">
                        <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                        <span>
                          يُحفظ مشفّرًا بخوارزمية AES-GCM في متصفحك فقط، ومفتاح التشفير مشتق من أصل هذا الموقع
                          ولا يخرج من جهازك.
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                        <span>لا يظهر المفتاح في أي حزمة JavaScript، ولا يُسجَّل في سجلات الخادم.</span>
                      </li>
                      <li className="flex gap-2">
                        <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                        <span>
                          لا يوجد تخزين آمن مطلق في المتصفح: أي إضافة أو هجوم XSS داخل الصفحة قد يصل إلى المفتاح
                          أثناء الاستخدام. لا تشاركه، وأبطله من AI Studio فور شكّك في تسرّبه.
                        </span>
                      </li>
                    </ul>
                    <p className="mt-2.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                      أضف رابطًا إلى Google AI Studio:{' '}
                      <a
                        href="https://aistudio.google.com/apikey"
                        target="_blank"
                        rel="noreferrer noopener"
                        className="font-bold text-brand-700 underline decoration-dotted underline-offset-2 dark:text-brand-300"
                      >
                        إنشاء مفتاح جديد
                      </a>
                    </p>
                  </section>

                  <section className={sectionClass}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white">
                        <KeyRound className="size-4 text-brand-600 dark:text-brand-300" aria-hidden />
                        حالة المفتاح على هذا الجهاز
                      </h3>
                      {hasPersistedKey ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                          <CircleCheck className="size-3.5" aria-hidden />
                          محفوظ ومشفّر
                        </span>
                      ) : (
                        <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                          في الذاكرة فقط
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                      {authMode === 'hybrid'
                        ? 'هذا الخادم يوفّر مفتاحًا احتياطيًا مشتركًا (حصته محدودة). مفتاحك الخاص أسرع وأكثر استقرارًا.'
                        : 'هذا الخادم لا يحتفظ بأي مفتاح: الترجمة تعمل بمفتاحك أنت فقط، ولا يُرسل إلى أي جهة غير Google.'}
                    </p>
                    <button
                      type="button"
                      onClick={onForgetKey}
                      disabled={settings.userApiKey.trim().length === 0}
                      className={cn(
                        'mt-2.5 inline-flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11px] font-bold text-rose-700 transition-colors hover:bg-rose-500/20 disabled:opacity-40 dark:text-rose-300',
                      )}
                    >
                      <Eraser className="size-3.5" aria-hidden />
                      احذف المفتاح من هذا الجهاز
                    </button>
                  </section>

                  {serverKeyConfigured ? (
                    <section className={sectionClass}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white">
                          <Server className="size-4 text-brand-600 dark:text-brand-300" aria-hidden />
                          المفتاح الاحتياطي على الخادم
                        </h3>
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                          <CircleCheck className="size-3.5" aria-hidden />
                          متاح
                        </span>
                      </div>
                      <p className="mt-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                        يُستخدم فقط عند غياب مفتاحك أو رفضه. اطلب من مدير الخادم إيقافه إن أردت بيئة خاصة تمامًا.
                      </p>
                      <button
                        type="button"
                        onClick={() => void runVerify('env', 'server')}
                        disabled={serverVerifying}
                        className={cn(secondaryButtonClass, 'mt-2.5')}
                      >
                        {serverVerifying ? (
                          <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Server className="size-3.5" aria-hidden />
                        )}
                        {serverVerifying ? 'جارٍ التحقق…' : 'تحقق من مفتاح الخادم'}
                      </button>
                      <VerifyFeedback state={serverVerify} className="mt-2.5" />
                    </section>
                  ) : null}
                </>
              ) : null}

              {tab === 'voice' ? (
                <>
                  <section className={sectionClass}>
                    <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white">
                      <Volume2 className="size-4 text-brand-600 dark:text-brand-300" aria-hidden />
                      صوت القراءة
                    </h3>
                    <label htmlFor="voice-select" className="mt-3 block text-[11px] font-bold text-slate-500 dark:text-slate-400">
                      الصوت المستخدم في النطق
                    </label>
                    <select
                      id="voice-select"
                      value={settings.speechVoiceUri}
                      onChange={(event) => onSave({ speechVoiceUri: event.target.value })}
                      className={cn(fieldClass, 'mt-1.5')}
                    >
                      <option value="">تلقائي — اختر حسب اللغة ({defaultTarget?.nativeLabel ?? 'English'})</option>
                      {voiceOptions.map((voice) => (
                        <option key={voice.uri} value={voice.uri}>
                          {voice.name} — {voice.lang}
                          {voice.localService ? ' (محلي)' : ''}
                        </option>
                      ))}
                    </select>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onTestVoice(testLanguageCode)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white shadow-sm shadow-brand-500/25 transition-colors duration-200 hover:bg-brand-500"
                      >
                        <Sparkles className="size-3.5" aria-hidden />
                        تجربة الصوت
                      </button>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {voices.length > 0
                          ? `${voices.length} صوت متاح في هذا المتصفح`
                          : 'لم يكتشف المتصفح أصواتًا بعد — قد تظهر خلال لحظات.'}
                      </span>
                    </div>
                    {voices.length === 0 ? (
                      <p className="mt-2 flex items-start gap-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        بعض المتصفحات تُحمّل قائمة الأصوات بعد أول تفاعل من المستخدم.
                      </p>
                    ) : null}
                  </section>

                  <section className={cn(sectionClass, 'space-y-4')}>
                    <SliderRow
                      id="speech-rate"
                      label="سرعة النطق"
                      hint={`من ${SPEECH_RATE_MIN} إلى ${SPEECH_RATE_MAX} — القيمة الافتراضية 1.0 (طبيعية).`}
                      value={settings.speechRate}
                      min={SPEECH_RATE_MIN}
                      max={SPEECH_RATE_MAX}
                      step={0.05}
                      display={`${settings.speechRate.toFixed(2)}×`}
                      onChange={(value) => onSave({ speechRate: value })}
                    />
                    <SliderRow
                      id="speech-volume"
                      label="مستوى الصوت"
                      hint="نسبة علو صوت القراءة أثناء النطق."
                      value={settings.speechVolume}
                      min={0}
                      max={1}
                      step={0.05}
                      display={`${Math.round(settings.speechVolume * 100)}%`}
                      onChange={(value) => onSave({ speechVolume: value })}
                    />
                    <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      <Volume1 className="size-3.5" aria-hidden />
                      يُطبَّق فورًا على أي نطق لاحق، بما في ذلك النطق التلقائي.
                    </div>
                  </section>

                  <section className={sectionClass}>
                    <SwitchRow
                      id="auto-speak"
                      label="النطق التلقائي بعد كل ترجمة"
                      description="يُقرأ الناتج بالصوت مباشرة بعد نجاح الترجمة."
                      checked={settings.autoSpeak}
                      onChange={(value) => onSave({ autoSpeak: value })}
                    />
                  </section>
                </>
              ) : null}

              {tab === 'translation' ? (
                <>
                  <section className={cn(sectionClass, 'space-y-4')}>
                    <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white">
                      <Gauge className="size-4 text-brand-600 dark:text-brand-300" aria-hidden />
                      حساسية التقاط الكلام
                    </h3>
                    <SliderRow
                      id="vad-silence"
                      label="مدة السكوت لإنهاء المقطع"
                      hint="كم مللي ثانية من السكوت تُغلق المقطع في النمط المستمر."
                      value={settings.vadSilenceMs}
                      min={VAD_SILENCE_MIN}
                      max={VAD_SILENCE_MAX}
                      step={100}
                      display={`${settings.vadSilenceMs} ms`}
                      onChange={(value) => onSave({ vadSilenceMs: value })}
                    />
                    <SliderRow
                      id="vad-threshold"
                      label="عتبة ضجيج الميكروفون"
                      hint="قيمة أعلى تعني حساسية أقل للضجيج المحيط."
                      value={settings.vadThreshold}
                      min={0.005}
                      max={0.25}
                      step={0.005}
                      display={`${(settings.vadThreshold * 100).toFixed(1)}%`}
                      onChange={(value) => onSave({ vadThreshold: value })}
                    />
                  </section>

                  <section className={cn(sectionClass, 'space-y-4')}>
                    <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white">
                      <Palette className="size-4 text-brand-600 dark:text-brand-300" aria-hidden />
                      المظهر واللغة
                    </h3>
                    <div>
                      <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">وضع المظهر</span>
                      <div className="mt-2 inline-flex rounded-2xl border border-slate-200 bg-white/70 p-1 dark:border-slate-700/70 dark:bg-slate-900/60">
                        {THEME_OPTIONS.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            aria-pressed={settings.theme === option.id}
                            onClick={() => onSave({ theme: option.id })}
                            className={cn(
                              'rounded-xl px-3 py-1.5 text-[11px] font-bold transition-colors duration-200',
                              settings.theme === option.id
                                ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/25'
                                : 'text-slate-600 hover:text-brand-700 dark:text-slate-300',
                            )}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-slate-100">
                        <Globe className="size-3.5" aria-hidden />
                        لغة واجهة التطبيق
                      </span>
                      <div className="mt-2 inline-flex rounded-2xl border border-slate-200 bg-white/70 p-1 dark:border-slate-700/70 dark:bg-slate-900/60">
                        {LOCALE_OPTIONS.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            aria-pressed={settings.locale === option.id}
                            onClick={() => onSave({ locale: option.id })}
                            className={cn(
                              'rounded-xl px-3 py-1.5 text-[11px] font-bold transition-colors duration-200',
                              settings.locale === option.id
                                ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/25'
                                : 'text-slate-600 hover:text-brand-700 dark:text-slate-300',
                            )}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </section>
                </>
              ) : null}

              {tab === 'data' ? (
                <>
                  <section className={cn(sectionClass, 'space-y-4')}>
                    <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white">
                      <HardDrive className="size-4 text-brand-600 dark:text-brand-300" aria-hidden />
                      حجم السجل المحفوظ
                    </h3>
                    <SliderRow
                      id="history-limit"
                      label="الحد الأقصى لعناصر السجل"
                      hint="تُحذف العناصر الأقدم تلقائيًا عند تجاوز هذا الحد."
                      value={settings.historyLimit}
                      min={HISTORY_LIMIT_MIN}
                      max={HISTORY_LIMIT_MAX}
                      step={10}
                      display={`${settings.historyLimit} عنصر`}
                      onChange={(value) => onSave({ historyLimit: value })}
                    />
                    <p className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                      <Star className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      عناصر المفضلة تُحفظ دائمًا في أعلى القائمة عند التصدير.
                    </p>
                  </section>

                  <section className={sectionClass}>
                    <SwitchRow
                      id="confirm-destructive"
                      label="اسأل قبل الحذف النهائي"
                      description="تأكيد قبل مسح السجل أو المسرد أو تصفير البيانات."
                      checked={settings.confirmDestructive}
                      onChange={(value) => onSave({ confirmDestructive: value })}
                    />
                  </section>

                  <section className={sectionClass}>
                    <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">نسخ احتياطي قبل التصفير</h3>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                      التصدير متاح من لوحة السجل (أيقونة السجل في الأعلى): تصدير JSON كامل أو ملف نصي مقروء، احتفظ بنسخة
                      قبل أي حذف نهائي.
                    </p>
                    <p className="mt-2.5 flex items-start gap-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                      <FileText className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      كل البيانات (السجل والمسرد والإعدادات) محفوظة في هذا المتصفح فقط ولا تُرفع إلى أي خادم.
                    </p>
                  </section>

                  <section className={cn(sectionClass, 'border-rose-500/40 bg-rose-500/5 dark:bg-rose-500/10')}>
                    <h3 className="flex items-center gap-2 text-sm font-extrabold text-rose-700 dark:text-rose-300">
                      <Eraser className="size-4" aria-hidden />
                      تصفير كل البيانات
                    </h3>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-rose-700/90 dark:text-rose-200/90">
                      يحذف السجل والمسرد والإعدادات والمفتاح المحفوظ من هذا المتصفح. سيطلب التطبيق تأكيدًا قبل التنفيذ.
                    </p>
                    <button
                      type="button"
                      onClick={onResetData}
                      className="mt-2.5 inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-2 text-xs font-bold text-white shadow-sm shadow-rose-500/25 transition-colors duration-200 hover:bg-rose-500"
                    >
                      <Eraser className="size-3.5" aria-hidden />
                      تصفير كل البيانات
                    </button>
                    <p className="mt-2 flex items-start gap-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                      <Upload className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      صدّر نسخة JSON قبل التصفير إن كنت تريد الاحتفاظ بترجماتك.
                    </p>
                  </section>
                </>
              ) : null}
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 px-4 py-3 dark:border-slate-800/70">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                التغييرات تُطبَّق تلقائيًا · لا حاجة لزر حفظ
              </span>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white transition-colors duration-200 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              >
                إغلاق
              </button>
            </footer>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
};

export default SettingsModal;
