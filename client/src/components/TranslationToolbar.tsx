/**
 * Language + context toolbar: source/target pickers with auto-detect, swap,
 * domain preset, tone and the free-form custom context instruction.
 */
import { useMemo } from 'react';
import { motion } from 'motion/react';
import { ArrowLeftRight, Briefcase, ChevronDown, Sparkles, Target, Wand2 } from 'lucide-react';
import { AUTO_LANGUAGE, LANGUAGE_OPTIONS, PRESET_OPTIONS, TONE_OPTIONS, findLanguage, findPreset, findTone } from '../constants';
import type { PresetId, ToneId } from '../types';
import { cn } from '../lib/utils';

export interface TranslationToolbarProps {
  sourceLang: string;
  targetLang: string;
  preset: PresetId;
  tone: ToneId;
  customContext: string;
  detectedLanguage?: string;
  disabled?: boolean;
  onSourceLangChange: (code: string) => void;
  onTargetLangChange: (code: string) => void;
  onSwap: () => void;
  onPresetChange: (preset: PresetId) => void;
  onToneChange: (tone: ToneId) => void;
  onCustomContextChange: (value: string) => void;
}

const selectClass =
  'w-full appearance-none rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm font-semibold text-slate-800 shadow-sm outline-none transition-colors hover:border-brand-400 focus-visible:border-brand-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100';

export const TranslationToolbar = ({
  sourceLang,
  targetLang,
  preset,
  tone,
  customContext,
  detectedLanguage,
  disabled,
  onSourceLangChange,
  onTargetLangChange,
  onSwap,
  onPresetChange,
  onToneChange,
  onCustomContextChange,
}: TranslationToolbarProps): React.JSX.Element => {
  const sourceOptions = useMemo(() => [AUTO_LANGUAGE, ...LANGUAGE_OPTIONS], []);
  const activePreset = findPreset(preset);
  const activeTone = findTone(tone);
  const sourceDirection = findLanguage(sourceLang)?.direction ?? 'ltr';

  return (
    <section
      aria-label="إعدادات اللغة والسياق"
      className="glass-panel rounded-3xl p-4 shadow-xl shadow-slate-900/5 sm:p-5"
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-end">
        <div>
          <label
            htmlFor="source-lang"
            className="mb-1.5 block text-xs font-bold text-slate-500 dark:text-slate-400"
          >
            اللغة المصدر
          </label>
          <div className="relative">
            <select
              id="source-lang"
              value={sourceLang}
              disabled={disabled}
              onChange={(event) => onSourceLangChange(event.target.value)}
              className={cn(selectClass, 'pe-9')}
              dir={sourceDirection}
            >
              {sourceOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.code === 'auto' ? `${option.nativeLabel} (${option.englishLabel})` : `${option.nativeLabel} — ${option.englishLabel}`}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
          </div>
          {detectedLanguage && sourceLang === 'auto' ? (
            <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-brand-600 dark:text-brand-300">
              <Sparkles className="size-3.5" aria-hidden />
              المكتشف: {detectedLanguage}
            </p>
          ) : null}
        </div>

        <div className="flex justify-center lg:pb-1">
          <motion.button
            type="button"
            whileTap={{ scale: 0.92, rotate: 180 }}
            onClick={onSwap}
            disabled={disabled}
            aria-label="تبديل اللغة المصدر والهدف"
            title="تبديل اللغتين"
            className="grid size-11 place-items-center rounded-2xl border border-brand-500/30 bg-brand-500/10 text-brand-700 transition-colors hover:bg-brand-500/20 disabled:opacity-40 dark:text-brand-200"
          >
            <ArrowLeftRight className="size-5 rtl:rotate-180" aria-hidden />
          </motion.button>
        </div>

        <div>
          <label
            htmlFor="target-lang"
            className="mb-1.5 block text-xs font-bold text-slate-500 dark:text-slate-400"
          >
            اللغة الهدف
          </label>
          <div className="relative">
            <select
              id="target-lang"
              value={targetLang}
              disabled={disabled}
              onChange={(event) => onTargetLangChange(event.target.value)}
              className={cn(selectClass, 'pe-9')}
              dir={findLanguage(targetLang)?.direction ?? 'ltr'}
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.nativeLabel} — {option.englishLabel}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <fieldset disabled={disabled} className="min-w-0">
          <legend className="mb-2 flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">
            <Briefcase className="size-3.5" aria-hidden />
            المجال التخصصي
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_OPTIONS.map((option) => {
              const active = option.id === preset;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onPresetChange(option.id)}
                  title={option.descriptionAr}
                  aria-pressed={active}
                  className={cn(
                    'flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition-all',
                    active
                      ? 'border-brand-500 bg-brand-500/15 text-brand-700 shadow-sm shadow-brand-500/20 dark:text-brand-200'
                      : 'border-slate-200 bg-white/60 text-slate-600 hover:border-brand-300 hover:text-brand-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:text-brand-200',
                  )}
                >
                  <span aria-hidden>{option.emoji}</span>
                  {option.labelAr}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            {activePreset.emoji} {activePreset.descriptionAr}
          </p>
        </fieldset>

        <fieldset disabled={disabled} className="min-w-0">
          <legend className="mb-2 flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">
            <Target className="size-3.5" aria-hidden />
            نبرة الترجمة
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {TONE_OPTIONS.map((option) => {
              const active = option.id === tone;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onToneChange(option.id)}
                  title={option.descriptionAr}
                  aria-pressed={active}
                  className={cn(
                    'flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition-all',
                    active
                      ? 'border-indigo-500 bg-indigo-500/15 text-indigo-700 shadow-sm shadow-indigo-500/20 dark:text-indigo-200'
                      : 'border-slate-200 bg-white/60 text-slate-600 hover:border-indigo-300 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:text-indigo-200',
                  )}
                >
                  <span aria-hidden>{option.emoji}</span>
                  {option.labelAr}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            {activeTone.emoji} {activeTone.descriptionAr}
          </p>

          <div className="mt-3">
            <label
              htmlFor="custom-context"
              className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400"
            >
              <Wand2 className="size-3.5" aria-hidden />
              تعليمات سياق مخصّصة (اختياري)
            </label>
            <input
              id="custom-context"
              type="text"
              value={customContext}
              disabled={disabled}
              maxLength={300}
              onChange={(event) => onCustomContextChange(event.target.value)}
              placeholder="مثال: ترجم كتقرير طوارئ عاجل، أو خاطب لجنة استثمار"
              className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-800 shadow-sm outline-none transition-colors placeholder:text-slate-400 hover:border-brand-400 focus-visible:border-brand-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              {customContext.length}/300 — تُرسل هذه التعليمات إلى الموديل مع كل طلب.
            </p>
          </div>
        </fieldset>
      </div>
    </section>
  );
};

export default TranslationToolbar;
