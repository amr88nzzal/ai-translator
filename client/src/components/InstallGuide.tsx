/**
 * دليل التثبيت — كشف المنصة، خطوات iOS، تثبيت PWA على أندرويد/سطح المكتب،
 * تغليف APK عبر PWABuilder، وملاحظات العمل دون اتصال.
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Apple,
  CircleCheck,
  CloudOff,
  Download,
  ExternalLink,
  Info,
  Monitor,
  Package,
  Rocket,
  Share,
  Smartphone,
  Sparkles,
  X,
} from 'lucide-react';

export interface InstallGuideProps {
  open: boolean;
  onClose: () => void;
}

type Platform = 'ios' | 'android' | 'desktop';

interface Step {
  title: string;
  detail: string;
}

const IOS_STEPS: Step[] = [
  { title: 'افتح التطبيق في Safari', detail: 'أضف الصفحة إلى الشاشة الرئيسية من متصفح Safari على iPhone أو iPad.' },
  { title: 'اضغط زر المشاركة', detail: 'الزر المربّع مع سهم للأعلى في شريط Safari السفلي.' },
  { title: 'اختر «إضافة إلى الشاشة الرئيسية»', detail: 'قد تحتاج إلى التمرير في قائمة المشاركة للوصول إليها.' },
  { title: 'أكّد الاسم ثم «إضافة»', detail: 'سيظهر أيقونة التطبيق على شاشتك الرئيسية ويعمل بملء الشاشة.' },
];

const ANDROID_STEPS: Step[] = [
  { title: 'افتح التطبيق في Chrome', detail: 'أو أي متصفح يدعم Chromium على أندرويد.' },
  { title: 'افتح قائمة المتصفح (⋮)', detail: 'في أعلى يسار أو يمين الشاشة حسب إعدادات المتصفح.' },
  { title: 'اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»', detail: 'قد يظهر خيار «Install app» مباشرة في القائمة.' },
  { title: 'أكّد التثبيت', detail: 'سيُضاف التطبيق إلى درج التطبيقات ويعمل دون شريط العنوان.' },
];

const DESKTOP_STEPS: Step[] = [
  { title: 'افتح التطبيق في Chrome أو Edge', detail: 'التثبيت متاح من سطح المكتب أيضًا.' },
  { title: 'ابحث عن أيقونة التثبيت في شريط العنوان', detail: 'أيقونة شاشة صغيرة مع سهم للأسفل بجانب شريط العنوان.' },
  { title: 'أو استخدم القائمة: تثبيت التطبيق', detail: 'من قائمة المتصفح ثم «تثبيت…» (Install).' },
  { title: 'أكّد الاسم', detail: 'يفتح التطبيق بعدها في نافذة مستقلة مع أيقونة في نظامك.' },
];

const PWABUILDER_STEPS: Step[] = [
  { title: 'افتح موقع PWABuilder', detail: 'https://www.pwabuilder.com ثم الصق رابط التطبيق المنشور.' },
  { title: 'اختر حزمة Android', detail: 'بعد التحليل اضغط «Package for stores» ثم «Android».' },
  { title: 'نزّل ملف APK/AAB', detail: 'اتبع الخطوات لتوليد الحزمة الموقّعة (يتطلب حساب توقيع).' },
  { title: 'ثبّت الحزمة على الجهاز', detail: 'فعّل «تثبيت من مصادر غير معروفة» ثم افتح الملف لتثبيته.' },
];

const PLATFORM_META: Record<Platform, { title: string; subtitle: string; steps: Step[]; icon: typeof Apple }> = {
  ios: {
    title: 'iOS / iPadOS — Safari',
    subtitle: 'التثبيت يدوي بالكامل لأن آبل لا تدعم التثبيت التلقائي.',
    steps: IOS_STEPS,
    icon: Apple,
  },
  android: {
    title: 'أندرويد — Chrome',
    subtitle: 'يدعم التثبيت التلقائي عبر زر «تثبيت الآن» أو من قائمة المتصفح.',
    steps: ANDROID_STEPS,
    icon: Smartphone,
  },
  desktop: {
    title: 'سطح المكتب — Chrome / Edge',
    subtitle: 'ثبّت التطبيق كنافذة مستقلة من أيقونة شريط العنوان.',
    steps: DESKTOP_STEPS,
    icon: Monitor,
  },
};

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'desktop';
  const agent = navigator.userAgent;
  const iOSLike =
    /iPad|iPhone|iPod/.test(agent) ||
    (agent.includes('Macintosh') && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1);
  if (iOSLike) return 'ios';
  if (/Android/i.test(agent)) return 'android';
  return 'desktop';
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
  } catch {
    /* matchMedia unavailable — fall back to the navigator flag */
  }
  return typeof navigator !== 'undefined' && navigator.standalone === true;
}

const StepList = ({ steps }: { steps: Step[] }): React.JSX.Element => (
  <ol className="mt-3 space-y-2.5">
    {steps.map((step, index) => (
      <li key={step.title} className="flex items-start gap-3">
        <span className="numeric mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand-600 text-[11px] font-bold text-white">
          {index + 1}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{step.title}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{step.detail}</p>
        </div>
      </li>
    ))}
  </ol>
);

export const InstallGuide = ({ open, onClose }: InstallGuideProps): React.JSX.Element => {
  const [platform, setPlatform] = useState<Platform>('desktop');
  const [standalone, setStandalone] = useState(false);
  const [promptReady, setPromptReady] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installed, setInstalled] = useState(false);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  /* كشف المنصة وحالة التثبيت عند التركيب. */
  useEffect(() => {
    setPlatform(detectPlatform());
    setStandalone(isStandalone());
  }, []);

  /* التقاط beforeinstallprompt داخل المكوّن مع منع السلوك الافتراضي. */
  useEffect(() => {
    const onBeforeInstallPrompt = (event: BeforeInstallPromptEvent): void => {
      event.preventDefault();
      deferredPrompt.current = event;
      setPromptReady(true);
    };
    const onInstalled = (): void => {
      deferredPrompt.current = null;
      setPromptReady(false);
      setInstalled(true);
      setStandalone(true);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  /* Escape للإغلاق + قفل تمرير الصفحة أثناء الفتح. */
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

  const handleInstall = async (): Promise<void> => {
    const event = deferredPrompt.current;
    if (!event) return;
    setInstalling(true);
    try {
      await event.prompt();
      const choice = await event.userChoice;
      if (choice.outcome === 'accepted') {
        setInstalled(true);
        deferredPrompt.current = null;
        setPromptReady(false);
      }
    } finally {
      setInstalling(false);
    }
  };

  const meta = PLATFORM_META[platform];
  const PlatformIcon = meta.icon;
  const canPrompt = promptReady && (platform === 'android' || platform === 'desktop');

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" dir="rtl">
          <motion.button
            type="button"
            aria-label="إغلاق دليل التثبيت"
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
            aria-label="دليل تثبيت التطبيق"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="glass-panel relative z-10 flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl shadow-2xl shadow-slate-950/40 outline-none sm:rounded-3xl"
          >
            <header className="flex items-start justify-between gap-3 border-b border-slate-200/70 px-4 py-3.5 dark:border-slate-800/70">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-base font-extrabold text-slate-900 dark:text-white">
                  <Download className="size-5 text-brand-600 dark:text-brand-300" aria-hidden />
                  تثبيت التطبيق على جهازك
                </h2>
                <p className="mt-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  يعمل «المترجم الصوتي والسياقي الذكي» كتطبيق مستقل بملء الشاشة دون متجر.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="إغلاق دليل التثبيت"
                title="إغلاق"
                className="grid size-9 place-items-center rounded-xl border border-slate-200 bg-white/70 text-slate-600 transition-colors duration-200 hover:text-brand-700 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-300"
              >
                <X className="size-4" aria-hidden />
              </button>
            </header>

            <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-4 py-4">
              {standalone || installed ? (
                <p className="flex items-start gap-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-[11px] font-semibold leading-relaxed text-emerald-700 dark:text-emerald-300">
                  <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                  التطبيق مثبّت ويعمل الآن كتطبيق مستقل — يمكنك إغلاق هذه النافذة.
                </p>
              ) : null}

              <section className="rounded-2xl border border-slate-200/80 bg-white/60 p-3.5 dark:border-slate-700/60 dark:bg-slate-900/40">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white">
                    <PlatformIcon className="size-4 text-brand-600 dark:text-brand-300" aria-hidden />
                    {meta.title}
                  </h3>
                  <span className="rounded-full border border-slate-300 bg-slate-500/10 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:border-slate-600 dark:text-slate-300">
                    منصتك الحالية
                  </span>
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{meta.subtitle}</p>

                {canPrompt ? (
                  <button
                    type="button"
                    onClick={() => void handleInstall()}
                    disabled={installing}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm shadow-brand-500/25 transition-colors duration-200 hover:bg-brand-500 disabled:opacity-40"
                  >
                    {installing ? (
                      <Sparkles className="size-4 animate-pulse" aria-hidden />
                    ) : (
                      <Rocket className="size-4" aria-hidden />
                    )}
                    {installing ? 'جارٍ فتح نافذة التثبيت…' : 'تثبيت الآن'}
                  </button>
                ) : platform === 'ios' ? (
                  <p className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold leading-relaxed text-amber-800 dark:text-amber-200">
                    <Share className="mt-0.5 size-4 shrink-0" aria-hidden />
                    على iPhone و iPad يتم التثبيت من قائمة المشاركة في Safari — اتبع الخطوات التالية.
                  </p>
                ) : (
                  <p className="mt-3 flex items-start gap-2 rounded-xl border border-slate-300/70 bg-slate-500/10 px-3 py-2 text-[11px] font-semibold leading-relaxed text-slate-600 dark:border-slate-600/70 dark:text-slate-300">
                    <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                    لم يُعلن المتصفح عن إمكانية التثبيت التلقائي بعد — استخدم الخطوات اليدوية التالية.
                  </p>
                )}

                <StepList steps={meta.steps} />
              </section>

              <section className="rounded-2xl border border-slate-200/80 bg-white/60 p-3.5 dark:border-slate-700/60 dark:bg-slate-900/40">
                <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white">
                  <Package className="size-4 text-brand-600 dark:text-brand-300" aria-hidden />
                  تغليف التطبيق كملف APK لأندرويد (PWABuilder)
                </h3>
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                  إن أردت نشر التطبيق على Google Play أو تثبيته كملف APK مستقل، استخدم أداة PWABuilder المجانية على رابط
                  التطبيق المنشور.
                </p>
                <a
                  href="https://www.pwabuilder.com"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="mt-2.5 inline-flex items-center gap-1.5 rounded-xl border border-brand-500/30 bg-brand-500/10 px-3 py-2 text-xs font-bold text-brand-700 transition-colors duration-200 hover:bg-brand-500/20 dark:text-brand-200"
                >
                  <ExternalLink className="size-3.5" aria-hidden />
                  فتح PWABuilder — pwabuilder.com
                </a>
                <StepList steps={PWABUILDER_STEPS} />
              </section>

              <section className="rounded-2xl border border-slate-200/80 bg-white/60 p-3.5 dark:border-slate-700/60 dark:bg-slate-900/40">
                <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-900 dark:text-white">
                  <CloudOff className="size-4 text-brand-600 dark:text-brand-300" aria-hidden />
                  العمل دون اتصال
                </h3>
                <ul className="mt-2 space-y-2 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />
                    يُخزَّن هيكل التطبيق وواجهته على جهازك بعد أول زيارة، فيفتح فورًا دون إنترنت.
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />
                    السجل ومسرد المصطلحات والإعدادات محفوظة محليًا في المتصفح وتظل متاحة دون اتصال.
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />
                    الترجمة الجديدة (نصًا أو صوتًا) تتطلب اتصالًا بالإنترنت لأن التحليل يجري على Gemini.
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />
                    لا تُحفظ أي بيانات في السحابة: كل شيء يبقى على هذا الجهاز.
                  </li>
                </ul>
              </section>
            </div>

            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 px-4 py-3 dark:border-slate-800/70">
              <span className="numeric text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                المنصة المكتشفة: {platform === 'ios' ? 'iOS / Safari' : platform === 'android' ? 'أندرويد' : 'سطح المكتب'}
              </span>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white transition-colors duration-200 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
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

export default InstallGuide;
