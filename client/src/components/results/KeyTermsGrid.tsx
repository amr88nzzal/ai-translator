/**
 * Key terms glossary produced by the contextual analysis: one card per
 * specialised term (source term → target rendering + note).
 */
import type { FC } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Lightbulb } from 'lucide-react';
import type { KeyTerm } from '@/types';
import { detectDirection } from '@/lib/utils';

export interface KeyTermsGridProps {
  terms: KeyTerm[];
  targetLangLabel: string;
}

export const KeyTermsGrid: FC<KeyTermsGridProps> = ({ terms, targetLangLabel }) => {
  if (terms.length === 0) return null;

  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label="المصطلحات المفتاحية">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className="grid size-8 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300"
            aria-hidden
          >
            <Lightbulb className="size-4" />
          </span>
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">المصطلحات المفتاحية</h3>
        </div>
        <span className="numeric rounded-full border border-slate-200 px-2.5 py-0.5 text-[11px] font-semibold text-slate-500 dark:border-slate-700/60 dark:text-slate-400">
          {terms.length} · إلى {targetLangLabel}
        </span>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {terms.map((term, index) => (
          <motion.article
            key={`${term.term}-${index}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: Math.min(index, 5) * 0.03, ease: 'easeOut' }}
            className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white/80 p-3 backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-900/70"
          >
            <p
              dir={detectDirection(term.term)}
              style={{ unicodeBidi: 'plaintext' }}
              className="min-w-0 break-words text-sm font-extrabold text-slate-900 dark:text-white"
            >
              {term.term.trim() ? term.term : '—'}
            </p>

            <span className="my-1.5 flex items-center text-slate-400 dark:text-slate-500" aria-hidden>
              <ArrowRight className="size-3.5 rtl:rotate-180" />
            </span>

            <p
              dir={detectDirection(term.translation)}
              style={{ unicodeBidi: 'plaintext' }}
              className="min-w-0 break-words text-sm font-bold text-brand-700 dark:text-brand-200"
            >
              {term.translation.trim() ? term.translation : '—'}
            </p>

            {term.note.trim() ? (
              <p
                dir={detectDirection(term.note)}
                style={{ unicodeBidi: 'plaintext' }}
                className="mt-2 border-t border-dashed border-slate-200 pt-2 text-[11px] leading-relaxed text-slate-500 dark:border-slate-700/60 dark:text-slate-400"
              >
                {term.note}
              </p>
            ) : null}
          </motion.article>
        ))}
      </div>
    </section>
  );
};

export default KeyTermsGrid;
