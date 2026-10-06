/**
 * بوابة أول تشغيل: تطلب من المستخدم مفتاح Gemini الخاص به.
 *
 * التطبيق لا يحتفظ بمفتاح على السيرفر، لذلك هذه الخطوة إلزامية قبل أول ترجمة.
 * البوابة تشرح: من أين يُحصل على المفتاح، أين يُخزَّن، وما لا يمكن حمايته
 * (لهذا نطلب من المستخدم عدم مشاركته وإبطاله إن شكّ في تسرّبه).
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  LoaderCircle,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { describeApiKeyProblem } from '@/lib/keyStore';
import { cn } from '@/lib/utils';

export interface ApiKeyGateProps {
  open: boolean;
  /** هل يوجد مفتاح محفوظ على هذا الجهاز؟ */
  hasStoredKey: boolean;
  /** `user` = مفتاح الخادم غير مستخدم إطلاقًا، `hybrid` = يوجد مفتاح خادم كخطة بديلة. */
  authMode: 'user' | 'hybrid';
  /** هل الخادم متاح؟ يحدّد ما إذا كان زر التحقق سيعمل. */
  serverReachable: boolean | null;
  saving: boolean;
  /** يحفظ المفتاح (مشفّرًا) ويعيد نتيجة التحقق من الشبكة. */
  onSave: (apiKey: string, remember: boolean) => Promise<{ valid: boolean; reason?: string }>;
  onOpenSettings: () => void;
}

const AI_STUDIO_URL = 'https://aistudio.google.com/apikey';

export const ApiKeyGate = ({
  open,
  hasStoredKey,
  authMode,
  serverReachable,
  saving,
  onSave,
  onOpenSettings,
}: ApiKeyGateProps): React.JSX.Element => {
  const [value, setValue] = useState('');
  const [visible, setVisible] = useState(false);
  const [remember, setRemember] = useState(true);
  const [verifyState, setVerifyState] = useState<'idle' | 'checking' | 'ok' | 'fail' | 'offline'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  const localProblem = useMemo(() => (value.length > 0 ? describeApiKeyProblem(value) : null), [value]);

  // إعادة التهيئة عند كل فتح، مع إضافة تركيز تلقائي على الحقل.
  useEffect(() => {
    if (!open) return;
    setVerifyState('idle');
    setMessage(null);
    const timer = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(timer);
  }, [open]);

  const handleSubmit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    const problem = describeApiKeyProblem(value);
    if (problem) {
      setVerifyState('fail');
      setMessage(problem);
      inputRef.current?.focus();
      return;
    }

    setVerifyState('checking');
    setMessage('جارٍ التحقق من المفتاح مع Google…');
    const result = await onSave(value.trim(), remember);

    if (result.valid) {
      setVerifyState('ok');
      setMessage(result.reason ?? 'المفتاح يعمل بنجاح.');
      return;
    }

    // التمييز بين «مفتاح خاطئ» و«تعذّر الاتصال» مهم: الأول لا يُحفظ.
    const offline = serverReachable === false || /اتصال|شبكة|مهلة/.test(result.reason ?? '');
    setVerifyState(offline ? 'offline' : 'fail');
    setMessage(result.reason ?? 'تعذّر التحقق من المفتاح.');
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="api-key-gate"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="glass-panel w-full max-w-lg rounded-3xl p-5 shadow-2xl shadow-slate-950/40 sm:p-6"
          >
            <header className="flex items-start gap-3">
              <span
                className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-500/30"
                aria-hidden
              >
                <KeyRound className="size-6" />
              </span>
              <div className="min-w-0">
                <h2 id={titleId} className="text-lg font-extrabold text-slate-900 dark:text-white">
                  أضف مفتاح Gemini الخاص بك للبدء
                </h2>
                <p id={descriptionId} className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  التطبيق لا يحتفظ بمفتاح مشترك على السيرفر. كل مستخدم يستخدم مفتاحه المجاني من Google،
                  فتكون الترجمة على حسابك وحصتك وحدك.
                </p>
              </div>
            </header>

            <ol className="mt-4 space-y-2 rounded-2xl border border-slate-200 bg-white/60 p-3 text-xs text-slate-600 dark:border-slate-700/70 dark:bg-slate-900/50 dark:text-slate-300">
              <li className="flex gap-2">
                <span className="numeric grid size-5 shrink-0 place-items-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
                  1
                </span>
                <span>
                  افتح{' '}
                  <a
                    href={AI_STUDIO_URL}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 font-bold text-brand-700 underline decoration-dotted underline-offset-2 dark:text-brand-300"
                  >
                    Google AI Studio
                    <ExternalLink className="size-3" aria-hidden />
                  </a>{' '}
                  وسجّل الدخول بحساب Google.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="numeric grid size-5 shrink-0 place-items-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
                  2
                </span>
                <span>
                  اضغط <strong>Create API key</strong> وانسخ المفتاح كاملًا. تبدأ مفاتيح Google عادة بـ{' '}
                  <code className="font-mono">AIza</code> أو <code className="font-mono">AQ.</code>
                </span>
              </li>
              <li className="flex gap-2">
                <span className="numeric grid size-5 shrink-0 place-items-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
                  3
                </span>
                <span>الصقه في الحقل أدناه. سنتحقق منه ثم نبدأ الترجمة فورًا.</span>
              </li>
            </ol>

            <form onSubmit={(event) => void handleSubmit(event)} className="mt-4">
              <label htmlFor="gate-api-key" className="mb-1.5 block text-xs font-bold text-slate-500 dark:text-slate-400">
                مفتاح Gemini API
              </label>
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <input
                    ref={inputRef}
                    id="gate-api-key"
                    type={visible ? 'text' : 'password'}
                    value={value}
                    onChange={(event) => {
                      setValue(event.target.value);
                      setVerifyState('idle');
                      setMessage(null);
                    }}
                    autoComplete="off"
                    spellCheck={false}
                    dir="ltr"
                    placeholder="AIza… أو AQ.…"
                    aria-invalid={localProblem !== null}
                    className={cn(
                      'w-full rounded-xl border bg-white/80 px-3 py-2.5 pe-10 font-mono text-sm text-slate-800 shadow-sm outline-none transition-colors placeholder:text-slate-400 dark:bg-slate-900/70 dark:text-slate-100',
                      localProblem
                        ? 'border-rose-400 focus-visible:border-rose-500'
                        : 'border-slate-200 hover:border-brand-400 focus-visible:border-brand-500 dark:border-slate-700',
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => setVisible((current) => !current)}
                    aria-label={visible ? 'إخفاء المفتاح' : 'إظهار المفتاح'}
                    className="absolute end-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                  </button>
                </div>
              </div>

              <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                  className="mt-0.5 size-4 accent-brand-600"
                />
                <span>
                  تذكّر المفتاح على هذا الجهاز (مشفّرًا بـ AES-GCM).
                  {!remember ? (
                    <span className="block text-slate-500 dark:text-slate-400">
                      سيُستخدم للمرة الحالية فقط ويُمحى عند إغلاق التبويب.
                    </span>
                  ) : null}
                </span>
              </label>

              {localProblem && value.length > 0 ? (
                <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-800 dark:text-amber-200">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>{localProblem}</span>
                </p>
              ) : null}

              {message && !localProblem ? (
                <p
                  className={cn(
                    'mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-[11px] font-semibold',
                    verifyState === 'ok'
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                      : verifyState === 'fail'
                        ? 'border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-200'
                        : 'border-slate-300/70 bg-slate-500/10 text-slate-700 dark:border-slate-600 dark:text-slate-200',
                  )}
                >
                  {verifyState === 'ok' ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
                  ) : verifyState === 'fail' ? (
                    <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  ) : (
                    <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                  )}
                  <span>{message}</span>
                </p>
              ) : null}

              {verifyState === 'offline' ? (
                <p className="mt-3 flex items-start gap-2 rounded-xl border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-[11px] font-semibold text-sky-800 dark:text-sky-200">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    لم نتمكن من الوصول إلى الخادم للتحقق الآن، وقد يكون المفتاح صحيحًا. يمكنك المتابعة، وسيُجرَّب
                    المفتاح عند أول ترجمة.
                  </span>
                </p>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="submit"
                  disabled={saving || verifyState === 'checking' || value.trim().length === 0}
                  className={cn(
                    'inline-flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-extrabold transition-all',
                    saving || verifyState === 'checking' || value.trim().length === 0
                      ? 'cursor-not-allowed bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-500'
                      : 'bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-lg shadow-brand-500/30 hover:from-brand-500 hover:to-brand-400',
                  )}
                >
                  {saving || verifyState === 'checking' ? (
                    <LoaderCircle className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Sparkles className="size-4" aria-hidden />
                  )}
                  {saving || verifyState === 'checking' ? 'جارٍ التحقق…' : 'تحقّق وابدأ الترجمة'}
                </button>

                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white/70 px-3 py-3 text-xs font-bold text-slate-600 transition-colors hover:border-brand-400 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300"
                >
                  خيارات متقدمة
                  <ArrowLeft className="size-3.5 rtl:rotate-180" aria-hidden />
                </button>
              </div>
            </form>

            <div className="mt-4 space-y-2 border-t border-slate-200/70 pt-3 text-[11px] leading-relaxed text-slate-500 dark:border-slate-700/60 dark:text-slate-400">
              <p className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                <span>
                  المفتاح لا يظهر أبدًا في حزمة التطبيق، ولا يُرسل إلى أي جهة غير Google (عبر وسيط التطبيق)، ويُخزَّن
                  مشفّرًا على جهازك.
                </span>
              </p>
              <p className="flex items-start gap-2">
                <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                <span>
                  لا يوجد تخزين آمن مطلق في المتصفح: أي إضافة أو هجوم XSS داخل الصفحة قد يصل إلى المفتاح أثناء
                  الاستخدام. لا تشاركه، وأبطله فورًا من AI Studio إن شككت في تسرّبه.
                </span>
              </p>
              {authMode === 'hybrid' ? (
                <p className="flex items-start gap-2">
                  <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span>
                    هذا الخادم يوفّر مفتاحًا احتياطيًا، لكن استخدامه مشترك ومحدود — مفتاحك الخاص يمنحك سرعة وحصة
                    أفضل.
                  </span>
                </p>
              ) : null}
              {hasStoredKey ? (
                <p className="flex items-start gap-2">
                  <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span>يوجد مفتاح محفوظ سابقًا على هذا الجهاز. أدخل مفتاحًا جديدًا لاستبداله.</span>
                </p>
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
};

export default ApiKeyGate;
