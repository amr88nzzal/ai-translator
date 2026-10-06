/**
 * Result panel: the single surface that owns the three states of a translation
 * request — loading skeleton, onboarding empty state, and the full result
 * (source + target + key terms + contextual analysis) with its metadata bar.
 */
import type { FC, ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Copy,
  Cpu,
  KeyRound,
  Languages,
  LoaderCircle,
  Mic,
  Repeat2,
  Server,
  SlidersHorizontal,
  Sparkles,
  Timer,
  TriangleAlert,
} from 'lucide-react';
import { findPreset, findTone } from '@/constants';
import type { TranslationResult } from '@/types';
import { GhostButton } from '@/components/results/GhostButton';
import { SourceCard } from '@/components/results/SourceCard';
import { TargetCard } from '@/components/results/TargetCard';
import { KeyTermsGrid } from '@/components/results/KeyTermsGrid';
import { ContextCard } from '@/components/results/ContextCard';
import { formatDuration, detectDirection } from '@/lib/utils';

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

const STEPS: { icon: ReactNode; title: string; detail: string }[] = [
  {
    icon: <Mic className="size-4" aria-hidden />,
    title: 'سجّل',
    detail: 'اضغط زر التسجيل وتحدّث بلهجتك، أو اكتب النص يدويًا في مُحرّر النص.',
  },
  {
    icon: <SlidersHorizontal className="size-4" aria-hidden />,
    title: 'اختر المجال',
    detail: 'حدّد المجال والنبرة (طبي، تقني، قانوني…) ليضبط الموديل المصطلحات تلقائيًا.',
  },
  {
    icon: <Sparkles className="size-4" aria-hidden />,
    title: 'استلم الترجمة',
    detail: 'تصل الترجمة مع التحليل السياقي والمصطلحات المفتاحية وزمن الاستجابة.',
  },
];

export const ResultPanel: FC<ResultPanelProps> = ({
  result,
  processing,
  onCopySource,
  onCopyTranslation,
  onStar,
  onShare,
  starred,
  onSpeakSource,
  onSpeakTarget,
  speakingId,
  speechSupported,
  sourceLangLabel,
  targetLangLabel,
  targetLangCode,
}) => {
  const targetCodeLabel = targetLangCode ? targetLangCode.toUpperCase() : '—';

  return (
    <section
      aria-live="polite"
      aria-busy={processing}
      aria-label="لوحة النتائج"
      className="glass-panel flex min-w-0 flex-col gap-4 rounded-2xl p-4 sm:p-5"
    >
      <AnimatePresence mode="wait" initial={false}>
        {processing ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex min-w-0 flex-col gap-4"
          >
            <div className="flex items-center gap-2">
              <LoaderCircle className="size-5 shrink-0 animate-spin text-brand-600 dark:text-brand-300" aria-hidden />
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                جارٍ التحليل السياقي للصوت…
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              نُفرّغ الكلام، نفهم المجال والنبرة، ثم نبني ترجمة مكافئة للمعنى لا للكلمات.
            </p>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="skeleton-shimmer h-28 rounded-2xl" aria-hidden />
              <div className="skeleton-shimmer h-28 rounded-2xl" aria-hidden />
            </div>
            <div className="skeleton-shimmer h-20 rounded-2xl" aria-hidden />
            <div className="skeleton-shimmer h-16 rounded-2xl" aria-hidden />
          </motion.div>
        ) : result ? (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="flex min-w-0 flex-col gap-4"
          >
            <header className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-xl bg-brand-600 text-white shadow-sm shadow-brand-500/25"
                  aria-hidden
                >
                  <Sparkles className="size-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-extrabold text-slate-900 dark:text-white">النتيجة</h3>
                  <p className="truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    من {sourceLangLabel} إلى {targetLangLabel} · {targetCodeLabel}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <GhostButton
                  onClick={onCopySource}
                  icon={<Copy className="size-4" aria-hidden />}
                  title="نسخ النص الأصلي"
                >
                  نسخ الأصل
                </GhostButton>
                <GhostButton
                  onClick={onCopyTranslation}
                  icon={<Copy className="size-4" aria-hidden />}
                  title="نسخ الترجمة"
                >
                  نسخ الترجمة
                </GhostButton>
              </div>
            </header>

            <div className="flex flex-wrap items-center gap-1.5" aria-label="بيانات الترجمة">
              <MetaChip
                icon={<Languages className="size-3.5" />}
                label="اللغة المكتشفة"
                value={result.detectedLanguage.trim() ? result.detectedLanguage : '—'}
                tone="accent"
              />
              <MetaChip
                icon={<Cpu className="size-3.5" />}
                label="الموديل"
                value={result.model.trim() ? result.model : '—'}
              />
              <MetaChip
                icon={<Timer className="size-3.5" />}
                label="زمن الاستجابة"
                value={formatDuration(result.latencyMs)}
              />
              {result.attempts > 1 ? (
                <MetaChip icon={<Repeat2 className="size-3.5" />} label="المحاولات" value={`${result.attempts}`} />
              ) : null}
              <MetaChip
                icon={result.keySource === 'user' ? <KeyRound className="size-3.5" /> : <Server className="size-3.5" />}
                label="المفتاح"
                value={result.keySource === 'user' ? 'مفتاحك' : 'مفتاح الخادم'}
              />
            </div>

            {result.keyWarning ? (
              <p className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-800 dark:text-amber-200">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span dir={detectDirection(result.keyWarning)} style={{ unicodeBidi: 'plaintext' }}>
                  {result.keyWarning}
                </span>
              </p>
            ) : null}

            <div className="grid min-w-0 gap-3 lg:grid-cols-2">
              <SourceCard
                transcription={result.transcription.trim() ? result.transcription : result.sourceText}
                sourceLangLabel={sourceLangLabel}
                sourceLangCode={result.sourceLang}
                audioUrl={result.audioUrl ?? result.sourceAudioUrl}
                kind={result.kind}
                durationMs={result.durationMs}
                onSpeak={onSpeakSource}
                speaking={speakingId === 'source'}
                speechSupported={speechSupported}
              />
              <TargetCard
                translation={result.translation}
                targetLangLabel={targetLangLabel}
                targetLangCode={targetLangCode}
                audioUrl={result.audioUrl}
                onSpeak={onSpeakTarget}
                speaking={speakingId === 'target'}
                speechSupported={speechSupported}
                onCopy={onCopyTranslation}
                onStar={onStar}
                onShare={onShare}
                starred={starred}
              />
            </div>

            <KeyTermsGrid terms={result.keyTerms} targetLangLabel={targetLangLabel} />

            <ContextCard
              analysis={result.contextAnalysis}
              model={result.model}
              latencyMs={result.latencyMs}
              attempts={result.attempts}
              keySource={result.keySource}
              presetLabel={findPreset(result.preset).labelAr}
              toneLabel={findTone(result.tone).labelAr}
              detectedLanguage={result.detectedLanguage}
            />
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex min-w-0 flex-col items-center gap-4 rounded-2xl border border-dashed border-slate-300/70 bg-white/50 px-4 py-8 text-center dark:border-slate-700/60 dark:bg-slate-900/40"
          >
            <span
              className="grid size-12 place-items-center rounded-2xl bg-brand-500/12 text-brand-700 dark:text-brand-200"
              aria-hidden
            >
              <Sparkles className="size-6" />
            </span>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">لا توجد ترجمة بعد</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                ثلاث خطوات فقط تفصلك عن ترجمة سياقية دقيقة تحفظ المعنى والمصطلح.
              </p>
            </div>

            <ol className="grid w-full gap-2 text-start sm:grid-cols-3">
              {STEPS.map((step, index) => (
                <li
                  key={step.title}
                  className="rounded-2xl border border-slate-200 bg-white/70 p-3 dark:border-slate-700/60 dark:bg-slate-900/60"
                >
                  <div className="flex items-center gap-2">
                    <span className="numeric grid size-6 shrink-0 place-items-center rounded-full bg-brand-600 text-[11px] font-bold text-white">
                      {index + 1}
                    </span>
                    <span className="text-brand-600 dark:text-brand-300">{step.icon}</span>
                    <p className="text-xs font-extrabold text-slate-900 dark:text-white">{step.title}</p>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                    {step.detail}
                  </p>
                </li>
              ))}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};

export default ResultPanel;
