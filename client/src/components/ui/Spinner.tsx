/**
 * Spinner / InlineDots — مؤشرات تحميل موحّدة للتطبيق.
 *
 * - `Spinner`: قوس دائري دوّار بأحجام قابلة للتحكم، مع لون Indigo افتراضي.
 *   يستخدم `currentColor` لذا يمكن تلوينه من الأب عبر `text-*`.
 * - `InlineDots`: ثلاث نقاط نابضة لعرضها داخل الأزرار والنصوص القصيرة.
 *
 * كلتاهما تحترم `prefers-reduced-motion` (تُبطئ/تُثبَّت الحركة).
 */
import { motion } from 'motion/react';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';

export interface SpinnerProps {
  size?: number;
  className?: string;
  label?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({ size = 32, className, label }) => {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const strokeWidth = Math.max(2, Math.round((size / 32) * 3.2));
  const radius = (50 - strokeWidth) / 2;

  return (
    <span
      role="status"
      aria-label={label ?? 'جارٍ التحميل'}
      className={cn('inline-grid place-items-center text-indigo-600 dark:text-indigo-400', className)}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 50 50"
        width={size}
        height={size}
        className={cn('block', !reducedMotion && 'animate-spin')}
        aria-hidden
      >
        <circle
          cx="25"
          cy="25"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className="opacity-20"
        />
        <circle
          cx="25"
          cy="25"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${Math.PI * radius * 0.32} ${Math.PI * radius}`}
          className="origin-center"
        />
      </svg>
    </span>
  );
};

export interface InlineDotsProps {
  className?: string;
}

export const InlineDots: React.FC<InlineDotsProps> = ({ className }) => {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  return (
    <span
      role="status"
      aria-label="جارٍ العمل"
      className={cn('inline-flex items-center gap-1 align-middle', className)}
    >
      {[0, 1, 2].map((index) => (
        <motion.span
          key={index}
          aria-hidden
          className={cn('size-1.5 rounded-full bg-current', reducedMotion && 'opacity-70')}
          animate={reducedMotion ? { opacity: [0.7, 0.3, 0.7] } : { opacity: [0.35, 1, 0.35], y: [0, -1.5, 0] }}
          transition={{ duration: reducedMotion ? 1.4 : 0.86, repeat: Infinity, delay: index * 0.14, ease: 'easeInOut' }}
        />
      ))}
    </span>
  );
};

export default Spinner;
