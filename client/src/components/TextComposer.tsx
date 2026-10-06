/**
 * Text input composer: quick text-to-text contextual translation with paste,
 * clear, character counting and quick sample phrases.
 */
import { motion } from 'motion/react';
import { ClipboardPaste, Eraser, Languages, Send, Sparkles } from 'lucide-react';
import { findLanguage } from '../constants';
import { cn } from '../lib/utils';

export interface TextComposerProps {
  value: string;
  loading: boolean;
  targetLang: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onPaste: () => void;
  onClear: () => void;
  onQuickSample: (text: string) => void;
}

const SAMPLES: { label: string; text: string }[] = [
  {
    label: 'تشخيص طبي',
    text: 'المريض يشكو من ألم صدري حاد ينتشر إلى الذراع اليسرى مع ضيق نفس وتعرق بارد منذ ساعتين، والتخطيط الكهربائي يظهر ارتفاعًا في مقطع ST.',
  },
  {
    label: 'عقد قانوني',
    text: 'يلتزم الطرف الثاني بتسليم الأعمال كاملة خلال ثلاثين يومًا من تاريخ التوقيع، ويُفرض على التأخير غرامة تأخير لا تتجاوز 5% من قيمة العقد.',
  },
  {
    label: 'تقرير تقني',
    text: 'تم نشر الخدمة على بيئة الإنتاج بعد اجتياز جميع اختبارات التكامل، ولوحظ ارتفاع زمن الاستجابة على نقطة النهاية الخاصة بالمصادقة، وسيتم تحسين الفهرسة غدًا.',
  },
  {
    label: 'محادثة يومية',
    text: 'والله ما قصرت، كفيت ووفيت! خلنا نشوفك بكرة على القهوة ونكمل السالفة.',
  },
];

export const TextComposer = ({
  value,
  loading,
  targetLang,
  disabled,
  onChange,
  onSubmit,
  onPaste,
  onClear,
  onQuickSample,
}: TextComposerProps): React.JSX.Element => {
  const target = findLanguage(targetLang);
  const canSubmit = value.trim().length > 0 && !loading && !disabled;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      if (canSubmit) onSubmit();
    }
  };

  return (
    <section className="glass-panel flex h-full flex-col rounded-3xl p-4 shadow-xl shadow-slate-900/5 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-800 dark:text-slate-100">
          <Languages className="size-4 text-brand-600 dark:text-brand-300" aria-hidden />
          ترجمة نصية سياقية
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPaste}
            disabled={disabled}
            aria-label="لصق نص من الحافظة"
            title="لصق"
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/70 px-2 py-1.5 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ClipboardPaste className="size-3.5" aria-hidden />
            لصق
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={disabled || value.length === 0}
            aria-label="مسح النص"
            title="مسح"
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/70 px-2 py-1.5 text-[11px] font-bold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Eraser className="size-3.5" aria-hidden />
            مسح
          </button>
        </div>
      </div>

      <textarea
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        rows={7}
        dir="auto"
        style={{ unicodeBidi: 'plaintext' }}
        placeholder="الصق أو اكتب النص هنا… سيتم تحليله سياقيًا وترجمته مع استخراج المصطلحات التخصصية."
        className="min-h-40 w-full flex-1 resize-y rounded-2xl border border-slate-200 bg-white/80 p-3.5 text-sm leading-relaxed text-slate-800 shadow-inner outline-none transition-colors placeholder:text-slate-400 hover:border-brand-400 focus-visible:border-brand-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
      />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="numeric">{value.length.toLocaleString('en-US')} حرف</span>
        <span className="hidden items-center gap-1 sm:flex">
          <kbd className="rounded border border-slate-300 px-1.5 py-0.5 font-sans text-[10px] dark:border-slate-600">
            Ctrl
          </kbd>
          +
          <kbd className="rounded border border-slate-300 px-1.5 py-0.5 font-sans text-[10px] dark:border-slate-600">
            Enter
          </kbd>
          للإرسال
        </span>
      </div>

      <div className="mt-3">
        <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
          <Sparkles className="size-3.5" aria-hidden />
          أمثلة سريعة لتجربة المجالات
        </p>
        <div className="flex flex-wrap gap-1.5">
          {SAMPLES.map((sample) => (
            <button
              key={sample.label}
              type="button"
              disabled={disabled}
              onClick={() => onQuickSample(sample.text)}
              className="rounded-lg border border-slate-200 bg-white/60 px-2 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:border-brand-400 hover:text-brand-700 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:text-brand-200"
            >
              {sample.label}
            </button>
          ))}
        </div>
      </div>

      <motion.button
        type="button"
        whileTap={{ scale: 0.98 }}
        onClick={onSubmit}
        disabled={!canSubmit}
        className={cn(
          'mt-4 flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-extrabold transition-all',
          canSubmit
            ? 'bg-gradient-to-r from-brand-600 to-brand-500 text-white shadow-lg shadow-brand-500/30 hover:from-brand-500 hover:to-brand-400'
            : 'cursor-not-allowed bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-500',
        )}
      >
        <Send className="size-4 rtl:rotate-180" aria-hidden />
        ترجم إلى {target?.nativeLabel ?? targetLang}
      </motion.button>
    </section>
  );
};

export default TextComposer;
