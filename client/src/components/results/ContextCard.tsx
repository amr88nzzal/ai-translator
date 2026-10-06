/**
 * Context card: the Arabic contextual analysis of the utterance plus the
 * request metadata chips (language, preset, tone, model, latency, attempts
 * and which Gemini key was used).
 */
import type { FC, ReactNode } from 'react';
import { motion } from 'motion/react';
import { Cpu, Gauge, KeyRound, Languages, Repeat2, Server, Sparkles, Tag, Timer } from 'lucide-react';
import { detectDirection, formatDuration } from '@/lib/utils';

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

interface MetaChipProps {
  icon: ReactNode;
  label: string;
  value: string;
  tone?: 'default' | 'accent';
}

const MetaChip: FC<MetaChipProps> = ({ icon, label, value, tone = 'default' }) => (
  <span
    className={
      tone === 'accent'
        ? 'inline-flex max-w-full items-center gap-1.5 rounded-full border border-brand-500/35 bg-brand-500/10 px-2.5 py-1 text-[11px] font-semibold text-brand-700 dark:text-brand-200'
        : 'inline-flex max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:border-slate-700/60 dark:bg-slate-900/60 dark:text-slate-300'
    }
    title={`${label}: ${value}`}
  >
    <span className="grid size-3.5 shrink-0 place-items-center" aria-hidden>
      {icon}
    </span>
    <span className="text-slate-400 dark:text-slate-500">{label}</span>
    <span className="numeric truncate">{value}</span>
  </span>
);

export const ContextCard: FC<ContextCardProps> = ({
  analysis,
  model,
  latencyMs,
  attempts,
  keySource,
  presetLabel,
  toneLabel,
  detectedLanguage,
}) => {
  const body = analysis.trim() ? analysis : 'لا يوجد تحليل سياقي متاح لهذه الترجمة.';
  const keyLabel = keySource === 'user' ? 'مفتاحك' : 'مفتاح الخادم';

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      aria-label="التحليل السياقي"
      className="flex min-w-0 flex-col gap-3 rounded-2xl border border-slate-200 bg-white/80 p-4 backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/70"
    >
      <header className="flex min-w-0 items-center gap-2">
        <span
          className="grid size-8 shrink-0 place-items-center rounded-xl bg-brand-500/12 text-brand-700 dark:text-brand-200"
          aria-hidden
        >
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-extrabold text-slate-900 dark:text-white">التحليل السياقي</h3>
          <p className="truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            كيف فهم الموديل النص قبل ترجمته
          </p>
        </div>
      </header>

      <p
        dir={detectDirection(body)}
        style={{ unicodeBidi: 'plaintext' }}
        className="text-body min-w-0 rounded-xl bg-slate-50/80 p-3 text-sm text-slate-700 dark:bg-slate-950/40 dark:text-slate-200"
      >
        {body}
      </p>

      <footer className="flex flex-wrap items-center gap-1.5">
        <MetaChip
          icon={<Languages className="size-3.5" />}
          label="اللغة المكتشفة"
          value={detectedLanguage.trim() ? detectedLanguage : '—'}
          tone="accent"
        />
        <MetaChip icon={<Tag className="size-3.5" />} label="المجال" value={presetLabel} />
        <MetaChip icon={<Gauge className="size-3.5" />} label="النبرة" value={toneLabel} />
        <MetaChip icon={<Cpu className="size-3.5" />} label="الموديل" value={model.trim() ? model : '—'} />
        <MetaChip icon={<Timer className="size-3.5" />} label="زمن الاستجابة" value={formatDuration(latencyMs)} />
        {attempts > 1 ? (
          <MetaChip icon={<Repeat2 className="size-3.5" />} label="المحاولات" value={`${attempts}`} />
        ) : null}
        <MetaChip
          icon={keySource === 'user' ? <KeyRound className="size-3.5" /> : <Server className="size-3.5" />}
          label="المفتاح"
          value={keyLabel}
        />
      </footer>
    </motion.section>
  );
};

export default ContextCard;
