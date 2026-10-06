/**
 * Source card: the transcription/typed text that produced the translation,
 * the original recording (when the input was audio) and a text-to-speech
 * button for re-listening.
 */
import type { FC } from 'react';
import { motion } from 'motion/react';
import { AudioLines, Clock3, Keyboard, Mic, Volume2 } from 'lucide-react';
import { IconButton } from '@/components/results/GhostButton';
import { detectDirection, formatDuration } from '@/lib/utils';

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

export const SourceCard: FC<SourceCardProps> = ({
  transcription,
  sourceLangLabel,
  sourceLangCode,
  audioUrl,
  kind,
  durationMs,
  onSpeak,
  speaking,
  speechSupported,
}) => {
  const body = transcription.trim() ? transcription : 'لا يوجد نص أصلي للعرض بعد.';
  const hasDuration = typeof durationMs === 'number' && durationMs > 0;
  const KindIcon = kind === 'audio' ? Mic : Keyboard;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      aria-label="النص الأصلي"
      className="flex min-w-0 flex-col gap-3 rounded-2xl border border-slate-200 bg-white/80 p-4 backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/70"
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-500/12 text-brand-700 dark:text-brand-200"
            aria-hidden
          >
            <KindIcon className="size-4" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-extrabold text-slate-900 dark:text-white">
              {kind === 'audio' ? 'ما سُمع من الصوت' : 'النص الأصلي'}
            </h3>
            <p className="truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              اللغة: {sourceLangLabel} · {sourceLangCode ? sourceLangCode.toUpperCase() : '—'}
            </p>
          </div>
        </div>

        <IconButton
          label={speaking ? 'إيقاف نطق النص الأصلي' : 'نطق النص الأصلي'}
          onClick={onSpeak}
          active={speaking}
          disabled={!speechSupported}
          title={speechSupported ? 'نطق النص الأصلي' : 'النطق غير مدعوم في هذا المتصفح'}
        >
          {speaking ? (
            <AudioLines className="size-4 animate-pulse" aria-hidden />
          ) : (
            <Volume2 className="size-4" aria-hidden />
          )}
        </IconButton>
      </header>

      {audioUrl ? (
        <audio
          controls
          preload="metadata"
          src={audioUrl}
          aria-label="تسجيل النص الأصلي"
          className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50/80 dark:border-slate-700/60 dark:bg-slate-950/60"
        />
      ) : null}

      <p
        dir={detectDirection(body)}
        style={{ unicodeBidi: 'plaintext' }}
        className="text-body min-w-0 rounded-xl bg-slate-50/80 p-3 text-sm text-slate-800 dark:bg-slate-950/40 dark:text-slate-100"
      >
        {body}
      </p>

      <footer className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
        {hasDuration ? (
          <span className="numeric inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 dark:border-slate-700/60">
            <Clock3 className="size-3" aria-hidden />
            مدة التسجيل {formatDuration(durationMs)}
          </span>
        ) : null}
        <span className="rounded-full border border-slate-200 px-2 py-0.5 dark:border-slate-700/60">
          {kind === 'audio' ? 'مصدر صوتي' : 'مصدر نصي'}
        </span>
      </footer>
    </motion.section>
  );
};

export default SourceCard;
