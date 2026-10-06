/**
 * Top bar: brand, live connection badge (server + key state) and the three
 * global actions (settings, history, install guide).
 */
import { motion } from 'motion/react';
import {
  BookMarked,
  Clock3,
  Download,
  Languages,
  Moon,
  Settings2,
  Sun,
  Wifi,
  WifiOff,
  Wrench,
} from 'lucide-react';
import type { ThemeMode } from '../types';
import { cn } from '../lib/utils';

export interface AppHeaderProps {
  online: boolean;
  /** يظهر فقط في الوضع المختلط؛ في وضع مفتاح المستخدم يبقى false دائمًا. */
  serverKeyConfigured: boolean;
  userKeyConfigured: boolean;
  serverReachable: boolean | null;
  activeModel?: string;
  theme: ThemeMode;
  onCycleTheme: () => void;
  onOpenSettings: () => void;
  onOpenHistory: () => void;
  onOpenInstall: () => void;
  onOpenGlossary: () => void;
  historyCount: number;
  glossaryCount: number;
}

const ThemeIcon = ({ theme }: { theme: ThemeMode }) => {
  if (theme === 'light') return <Sun className="size-5" aria-hidden />;
  if (theme === 'dark') return <Moon className="size-5" aria-hidden />;
  return <Wrench className="size-5" aria-hidden />;
};

export const AppHeader = ({
  online,
  serverKeyConfigured,
  userKeyConfigured,
  serverReachable,
  activeModel,
  theme,
  onCycleTheme,
  onOpenSettings,
  onOpenHistory,
  onOpenInstall,
  onOpenGlossary,
  historyCount,
  glossaryCount,
}: AppHeaderProps): React.JSX.Element => {
  const keyReady = userKeyConfigured || serverKeyConfigured;
  const degraded = !online || serverReachable === false;

  const badgeTone = degraded
    ? 'bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/30'
    : keyReady
      ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
      : 'bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/30';

  const badgeLabel = !online
    ? 'غير متصل بالإنترنت'
    : serverReachable === false
      ? 'الخادم غير متاح'
      : userKeyConfigured
        ? 'جاهز — مفتاحك مفعّل'
        : serverKeyConfigured
          ? 'جاهز — مفتاح احتياطي على الخادم'
          : 'أضف مفتاح Gemini للبدء';

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-950/70">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="grid size-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-500/30"
          >
            <Languages className="size-6" aria-hidden />
          </motion.div>

          <div className="min-w-0">
            <h1 className="truncate text-base font-extrabold tracking-tight text-slate-900 sm:text-lg dark:text-white">
              المترجم الصوتي والسياقي الذكي
            </h1>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              ترجمة فورية بالذكاء الاصطناعي متعدد الوسائط — صوت ونص
            </p>
          </div>
        </div>

        <div className="order-3 flex w-full items-center gap-2 sm:order-2 sm:w-auto">
          <div
            className={cn(
              'flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold',
              badgeTone,
            )}
            title={activeModel ? `الموديل النشط: ${activeModel}` : undefined}
          >
            {online ? <Wifi className="size-4" aria-hidden /> : <WifiOff className="size-4" aria-hidden />}
            <span className="whitespace-nowrap">{badgeLabel}</span>
            <span
              className={cn(
                'size-2 rounded-full',
                degraded ? 'bg-amber-500' : keyReady ? 'bg-emerald-500' : 'bg-rose-500',
              )}
              aria-hidden
            />
          </div>
        </div>

        <div className="order-2 flex items-center gap-1.5 sm:order-3">
          <button
            type="button"
            onClick={onCycleTheme}
            aria-label="تبديل المظهر بين الفاتح والداكن والنظام"
            title="تبديل المظهر"
            className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white/70 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ThemeIcon theme={theme} />
          </button>

          <button
            type="button"
            onClick={onOpenGlossary}
            aria-label="فتح مسرد المصطلحات"
            title="مسرد المصطلحات"
            className="relative grid size-10 place-items-center rounded-xl border border-slate-200 bg-white/70 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <BookMarked className="size-5" aria-hidden />
            {glossaryCount > 0 ? (
              <span className="numeric absolute -end-1 -top-1 grid min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white">
                {glossaryCount > 99 ? '99+' : glossaryCount}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            onClick={onOpenHistory}
            aria-label="فتح سجل الترجمات"
            title="سجل الترجمات"
            className="relative grid size-10 place-items-center rounded-xl border border-slate-200 bg-white/70 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Clock3 className="size-5" aria-hidden />
            {historyCount > 0 ? (
              <span className="numeric absolute -end-1 -top-1 grid min-w-5 place-items-center rounded-full bg-slate-700 px-1 text-[10px] font-bold text-white dark:bg-slate-600">
                {historyCount > 99 ? '99+' : historyCount}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            onClick={onOpenInstall}
            aria-label="طريقة تثبيت التطبيق على جهازك"
            title="تثبيت التطبيق"
            className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white/70 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Download className="size-5" aria-hidden />
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="فتح الإعدادات"
            title="الإعدادات"
            className="grid size-10 place-items-center rounded-xl border border-brand-500/30 bg-brand-500/10 text-brand-700 transition-colors hover:bg-brand-500/20 dark:text-brand-200"
          >
            <Settings2 className="size-5" aria-hidden />
          </button>
        </div>
      </div>
    </header>
  );
};

export default AppHeader;
