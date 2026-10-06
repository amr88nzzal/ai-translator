/**
 * Live feed: the continuous-mode transcript. Newest segment first, with live
 * counters, per-segment status colours and per-segment actions (replay, retry,
 * copy, speak).
 */
import { useEffect, useMemo, useRef, type FC } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AudioLines,
  CircleAlert,
  Clock3,
  Copy,
  Eraser,
  Languages,
  Play,
  Radio,
  RefreshCw,
  Timer,
  Volume2,
} from 'lucide-react';
import { GhostButton, IconButton } from '@/components/results/GhostButton';
import { cn, detectDirection, formatClock, formatDuration } from '@/lib/utils';
import type { LiveSegment, SegmentStatus } from '@/types';

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

export interface LiveSegmentRowProps {
  segment: LiveSegment;
  onReplay: (segment: LiveSegment) => void;
  onRetry: (segment: LiveSegment) => void;
  onCopy: (segment: LiveSegment) => void;
  onSpeak: (segment: LiveSegment) => void;
  targetLangLabel: string;
}

const STATUS_META: Record<SegmentStatus, { label: string; chip: string; dot: string }> = {
  pending: {
    label: 'بالانتظار',
    chip: 'border-slate-300/70 bg-slate-500/10 text-slate-600 dark:border-slate-600/70 dark:text-slate-300',
    dot: 'bg-slate-400',
  },
  recording: {
    label: 'يسجّل الآن',
    chip: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-200',
    dot: 'bg-rose-500 animate-pulse',
  },
  processing: {
    label: 'قيد المعالجة',
    chip: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-200',
    dot: 'bg-amber-500 animate-pulse',
  },
  completed: {
    label: 'مكتمل',
    chip: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200',
    dot: 'bg-emerald-500',
  },
  error: {
    label: 'تعذّرت الترجمة',
    chip: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-200',
    dot: 'bg-rose-500',
  },
};

export const LiveSegmentRow: FC<LiveSegmentRowProps> = ({
  segment,
  onReplay,
  onRetry,
  onCopy,
  onSpeak,
  targetLangLabel,
}) => {
  const meta = STATUS_META[segment.status];
  const hasSource = segment.transcription.trim().length > 0;
  const hasTranslation = segment.translation.trim().length > 0;
  const isBusy = segment.status === 'processing' || segment.status === 'recording';

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      aria-label={`المقطع رقم ${segment.index}`}
      className="flex min-w-0 flex-col gap-2.5 rounded-2xl border border-slate-200 bg-white/80 p-3 backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/70"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="numeric rounded-lg bg-slate-900 px-2 py-0.5 text-[11px] font-bold text-white dark:bg-slate-100 dark:text-slate-900">
            #{segment.index}
          </span>

          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-bold',
              meta.chip,
            )}
          >
            <span className={cn('size-1.5 rounded-full', meta.dot)} aria-hidden />
            {meta.label}
          </span>

          <span className="numeric inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
            <Clock3 className="size-3" aria-hidden />
            {formatClock(segment.createdAt)}
          </span>

          {segment.durationMs > 0 ? (
            <span className="numeric inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              <Timer className="size-3" aria-hidden />
              {formatDuration(segment.durationMs)}
            </span>
          ) : null}

          {segment.detectedLanguage.trim() ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:border-slate-700/60 dark:text-slate-400">
              <Languages className="size-3" aria-hidden />
              {segment.detectedLanguage}
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {segment.audioUrl ? (
            <IconButton
              label={`إعادة تشغيل صوت المقطع رقم ${segment.index}`}
              onClick={() => onReplay(segment)}
              title="إعادة تشغيل الصوت"
            >
              <Play className="size-4" aria-hidden />
            </IconButton>
          ) : null}

          {segment.status === 'error' ? (
            <IconButton
              label={`إعادة محاولة ترجمة المقطع رقم ${segment.index}`}
              onClick={() => onRetry(segment)}
              title="إعادة المحاولة"
            >
              <RefreshCw className="size-4" aria-hidden />
            </IconButton>
          ) : null}

          <IconButton label={`نسخ ترجمة المقطع رقم ${segment.index}`} onClick={() => onCopy(segment)} title="نسخ الترجمة">
            <Copy className="size-4" aria-hidden />
          </IconButton>

          <IconButton
            label={`نطق ترجمة المقطع رقم ${segment.index}`}
            onClick={() => onSpeak(segment)}
            disabled={!hasTranslation}
            title="نطق الترجمة"
          >
            <Volume2 className="size-4" aria-hidden />
          </IconButton>
        </div>
      </header>

      {hasSource ? (
        <p
          dir={detectDirection(segment.transcription)}
          style={{ unicodeBidi: 'plaintext' }}
          className="text-body min-w-0 rounded-xl bg-slate-50/80 p-2.5 text-sm text-slate-700 dark:bg-slate-950/40 dark:text-slate-200"
        >
          {segment.transcription}
        </p>
      ) : isBusy ? (
        <div className="skeleton-shimmer h-5 w-2/3 rounded-lg" aria-hidden />
      ) : (
        <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">لم يُلتقط نص في هذا المقطع.</p>
      )}

      {hasTranslation ? (
        <div className="min-w-0 rounded-xl bg-brand-50/70 p-2.5 dark:bg-brand-950/25">
          <p className="mb-1 text-[10px] font-bold text-brand-700 dark:text-brand-200">
            الترجمة إلى {targetLangLabel}
          </p>
          <p
            dir={detectDirection(segment.translation)}
            style={{ unicodeBidi: 'plaintext' }}
            className="text-body min-w-0 text-sm font-semibold text-slate-900 dark:text-slate-50"
          >
            {segment.translation}
          </p>
        </div>
      ) : isBusy ? (
        <div className="skeleton-shimmer h-5 w-1/2 rounded-lg" aria-hidden />
      ) : null}

      {segment.status === 'error' && segment.error ? (
        <p className="flex items-start gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-rose-700 dark:text-rose-200">
          <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span dir={detectDirection(segment.error)} style={{ unicodeBidi: 'plaintext' }}>
            {segment.error}
          </span>
        </p>
      ) : null}
    </motion.article>
  );
};

export const LiveFeed: FC<LiveFeedProps> = ({
  segments,
  onReplay,
  onRetry,
  onClear,
  onCopySegment,
  onSpeakSegment,
  isRecording,
  targetLangLabel,
}) => {
  const sorted = useMemo(
    () => [...segments].sort((left, right) => right.createdAt - left.createdAt || right.index - left.index),
    [segments],
  );

  const latestId = sorted.length > 0 ? sorted[0]?.id ?? null : null;
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!latestId) return;
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [latestId]);

  const total = segments.length;
  const completed = sorted.filter((segment) => segment.status === 'completed').length;

  return (
    <section
      aria-label="البث المباشر"
      className="glass-panel flex min-w-0 flex-col gap-3 rounded-2xl p-4 sm:p-5"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
            aria-hidden
          >
            <AudioLines className="size-4" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-extrabold text-slate-900 dark:text-white">البث المباشر</h3>
            <p className="numeric truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              إجمالي المقاطع: {total} · مكتملة: {completed}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isRecording ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-[11px] font-bold text-rose-700 dark:text-rose-200">
              <Radio className="size-3.5 animate-pulse" aria-hidden />
              يستمع الآن
            </span>
          ) : null}

          <GhostButton
            onClick={onClear}
            disabled={total === 0}
            icon={<Eraser className="size-4" aria-hidden />}
            title="مسح كل مقاطع البث"
          >
            مسح البث
          </GhostButton>
        </div>
      </header>

      {total === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300/70 bg-white/50 px-4 py-6 text-center dark:border-slate-700/60 dark:bg-slate-900/40">
          <span
            className="grid size-10 place-items-center rounded-2xl bg-slate-500/10 text-slate-500 dark:text-slate-300"
            aria-hidden
          >
            <Radio className="size-5" />
          </span>
          <p className="text-sm font-extrabold text-slate-900 dark:text-white">لا توجد مقاطع في البث بعد</p>
          <p className="max-w-md text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            لتفعيل البث المستمر اختر النمط «بث مباشر» (مستمر) من بطاقة التسجيل ثم اضغط زر التسجيل: يبقى الميكروفون
            مفتوحًا، ويقطّع التطبيق كلامك تلقائيًا عند السكوت، ويرسل كل مقطع ليظهر هنا مترتبًا بالأحدث أولًا.
            <br />
            لكل مقطع: زر لتشغيل صوته، وزر لإعادة المحاولة عند الفشل، وزر للنسخ، وزر للنطق.
          </p>
        </div>
      ) : (
        <div ref={scrollRef} className="flex max-h-[26rem] min-w-0 flex-col gap-2.5 overflow-y-auto pe-1">
          <AnimatePresence initial={false}>
            {sorted.map((segment) => (
              <LiveSegmentRow
                key={segment.id}
                segment={segment}
                onReplay={onReplay}
                onRetry={onRetry}
                onCopy={onCopySegment}
                onSpeak={onSpeakSegment}
                targetLangLabel={targetLangLabel}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
};

export default LiveFeed;
