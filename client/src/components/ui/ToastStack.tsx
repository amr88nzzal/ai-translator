/**
 * ToastStack — حاوية الإشعارات العائمة (نجاح / خطأ / معلومة / تحذير).
 *
 * - تُعرض في أعلى الشاشة بمحاذاة منطقية (`end-0`) لتعمل في RTL و LTR.
 * - كل إشعار يحمل أيقونة دلالية ولونًا خاصًا، مع شريط زمني متحرك.
 * - تُحترم `prefers-reduced-motion` عبر `useMediaQuery` فلا تُشغَّل الحركة.
 */
import { AnimatePresence, motion } from 'motion/react';
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';
import type { ToastMessage } from '@/types';

export interface ToastStackProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

/** كل نبرة: أيقونة، ألوان الحدود والخلفية، ولون الأيقونة والنص. */
const TONE_STYLES: Record<
  ToastMessage['tone'],
  { icon: LucideIcon; wrapper: string; iconClass: string; titleClass: string; barClass: string }
> = {
  success: {
    icon: CircleCheck,
    wrapper: 'border-emerald-300/80 bg-white/90 dark:border-emerald-500/35 dark:bg-slate-900/85',
    iconClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
    titleClass: 'text-emerald-800 dark:text-emerald-100',
    barClass: 'bg-emerald-500',
  },
  error: {
    icon: CircleAlert,
    wrapper: 'border-rose-300/80 bg-white/90 dark:border-rose-500/35 dark:bg-slate-900/85',
    iconClass: 'bg-rose-500/15 text-rose-600 dark:text-rose-300',
    titleClass: 'text-rose-800 dark:text-rose-100',
    barClass: 'bg-rose-500',
  },
  warning: {
    icon: TriangleAlert,
    wrapper: 'border-amber-300/80 bg-white/90 dark:border-amber-500/35 dark:bg-slate-900/85',
    iconClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-300',
    titleClass: 'text-amber-800 dark:text-amber-100',
    barClass: 'bg-amber-500',
  },
  info: {
    icon: Info,
    wrapper: 'border-indigo-300/80 bg-white/90 dark:border-indigo-500/35 dark:bg-slate-900/85',
    iconClass: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-300',
    titleClass: 'text-indigo-800 dark:text-indigo-100',
    barClass: 'bg-indigo-500',
  },
};

const DIRECTION_LABELS: Record<ToastMessage['tone'], string> = {
  success: 'إشعار نجاح',
  error: 'إشعار خطأ',
  warning: 'تحذير',
  info: 'معلومة',
};

/** مدة العرض المقدَّرة لمطابقة `useToasts` (أخطاء أطول لأنها تحتاج قراءة). */
const durationFor = (tone: ToastMessage['tone']): number => (tone === 'error' ? 9 : 4.8);

export const ToastStack: React.FC<ToastStackProps> = ({ toasts, onDismiss }) => {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-4 z-[70] flex flex-col items-center gap-2 px-3 sm:items-end sm:px-6"
      role="region"
      aria-label="الإشعارات"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const style = TONE_STYLES[toast.tone];
          const Icon = style.icon;
          return (
            <motion.div
              key={toast.id}
              layout
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -14, scale: 0.97 }}
              animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.97 }}
              transition={{ duration: reducedMotion ? 0.08 : 0.22, ease: 'easeOut' }}
              role="status"
              className={cn(
                'pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-2xl border shadow-lg shadow-slate-900/10 backdrop-blur-xl dark:shadow-black/40',
                style.wrapper,
              )}
            >
              <div className="flex items-start gap-3 p-3 pe-2">
                <span
                  className={cn('grid size-9 shrink-0 place-items-center rounded-xl', style.iconClass)}
                  aria-hidden
                >
                  <Icon className="size-5" />
                </span>

                <div className="min-w-0 flex-1 py-0.5">
                  <p className={cn('text-sm leading-6 font-extrabold', style.titleClass)} dir="auto">
                    {toast.title}
                  </p>
                  {toast.description ? (
                    <p
                      className="mt-0.5 text-xs leading-5 font-semibold text-slate-600 dark:text-slate-300"
                      dir="auto"
                      style={{ unicodeBidi: 'plaintext' }}
                    >
                      {toast.description}
                    </p>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => onDismiss(toast.id)}
                  aria-label={`إغلاق ${DIRECTION_LABELS[toast.tone]}`}
                  className="grid size-7 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors duration-200 hover:bg-slate-900/5 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-white/10 dark:hover:text-slate-200"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>

              {/* شريط زمني يوضّح ما تبقّى قبل الإغلاق التلقائي (يتقلّص نحو جهة البداية في RTL). */}
              <motion.span
                aria-hidden
                className={cn('block h-0.5 origin-right opacity-70', style.barClass)}
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: durationFor(toast.tone), ease: 'linear' }}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

export default ToastStack;
