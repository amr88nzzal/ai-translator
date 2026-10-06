/**
 * مسرد المصطلحات — شبكة بطاقات مجمّعة من `entries` مع عدّاد التكرار وشارات
 * المجال واللغتين، وبحث فوري وفرز، وأزرار نسخ/نطق/حذف/مسح الكل.
 *
 * يعمل المكوّن بطريقتين:
 *  - مضمَّن (الافتراضي): قسم قابل للطيّ داخل الصفحة.
 *  - مُتحكَّم به: عند تمرير `open`/`onClose` يعمل كلوحة منزلقة من جهة النهاية.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowDownUp,
  BookOpen,
  Check,
  Copy,
  Eraser,
  Search,
  Sparkles,
  Star,
  Trash,
  Volume2,
  X,
} from 'lucide-react';
import { PRESET_OPTIONS, findLanguage, findPreset } from '@/constants';
import type { GlossaryEntry, PresetId } from '@/types';
import { cn, copyToClipboard, detectDirection, relativeTime, truncate } from '@/lib/utils';

export interface GlossaryPanelProps {
  entries: GlossaryEntry[];
  onDelete: (id: string) => void;
  onClear: () => void;
  onSpeak: (entry: GlossaryEntry) => void;
  /** عند تمريرها يعمل المكوّن كلوحة منزلقة مُتحكَّم بها من الأب. */
  open?: boolean;
  /** مطلوبة مع `open` لإغلاق اللوحة. */
  onClose?: () => void;
}

type SortId = 'recent' | 'count' | 'alpha';

const SORT_OPTIONS: ReadonlyArray<{ id: SortId; label: string }> = [
  { id: 'recent', label: 'الأحدث' },
  { id: 'count', label: 'الأكثر تكرارًا' },
  { id: 'alpha', label: 'أبجدي' },
];

const PRESET_TONE: Record<string, string> = {
  general: 'bg-slate-500/12 text-slate-700 dark:text-slate-200 border-slate-500/25',
  medical: 'bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/25',
  tech: 'bg-sky-500/12 text-sky-700 dark:text-sky-300 border-sky-500/25',
  legal: 'bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/25',
  business: 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/25',
  casual: 'bg-fuchsia-500/12 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/25',
  tourism: 'bg-teal-500/12 text-teal-700 dark:text-teal-300 border-teal-500/25',
  academic: 'bg-violet-500/12 text-violet-700 dark:text-violet-300 border-violet-500/25',
};

const actionClass =
  'grid size-8 place-items-center rounded-xl border border-slate-200/80 bg-white/70 text-slate-600 transition-colors duration-200 hover:border-brand-400 hover:text-brand-700 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:border-brand-500/60 dark:hover:text-brand-200';

const safeRelativeTime = (timestamp: number): string => {
  try {
    return relativeTime(timestamp);
  } catch {
    return 'الآن';
  }
};

export const GlossaryPanel = ({
  entries,
  onDelete,
  onClear,
  onSpeak,
  open,
  onClose,
}: GlossaryPanelProps): React.JSX.Element => {
  const controlled = open !== undefined;
  const [localOpen, setLocalOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [presetFilter, setPresetFilter] = useState<PresetId | 'all'>('all');
  const [sort, setSort] = useState<SortId>('recent');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);

  const isOpen = controlled ? open : localOpen;
  const requestClose = (): void => {
    if (controlled) onClose?.();
    else setLocalOpen(false);
  };

  /* Escape للإغلاق + قفل تمرير الصفحة أثناء فتح اللوحة المُتحكَّم بها. */
  useEffect(() => {
    if (!controlled || !isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose?.();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    panelRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [controlled, isOpen, onClose]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = entries.filter((entry) => {
      if (presetFilter !== 'all' && entry.preset !== presetFilter) return false;
      if (!needle) return true;
      return [entry.term, entry.translation, entry.note].join(' ').toLowerCase().includes(needle);
    });
    const sorted = [...filtered];
    if (sort === 'recent') sorted.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
    else if (sort === 'count') sorted.sort((a, b) => b.count - a.count || b.lastSeenAt - a.lastSeenAt);
    else sorted.sort((a, b) => a.term.localeCompare(b.term, 'ar'));
    return sorted;
  }, [entries, query, presetFilter, sort]);

  const totalRepeats = useMemo(() => entries.reduce((sum, entry) => sum + entry.count, 0), [entries]);
  const languages = useMemo(
    () => new Set(entries.map((entry) => `${entry.sourceLang}→${entry.targetLang}`)).size,
    [entries],
  );

  const handleClear = (): void => {
    if (typeof window !== 'undefined' && !window.confirm('سيتم حذف كل مصطلحات المسرد نهائيًا. هل تريد المتابعة؟')) {
      return;
    }
    onClear();
  };

  const handleCopy = (entry: GlossaryEntry): void => {
    void copyToClipboard(`${entry.term} = ${entry.translation}`).then((done) => {
      if (!done) return;
      setCopiedId(entry.id);
      window.setTimeout(() => setCopiedId((current) => (current === entry.id ? null : current)), 1600);
    });
  };

  const header = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-base font-extrabold text-slate-900 dark:text-white">
          <BookOpen className="size-5 text-brand-600 dark:text-brand-300" aria-hidden />
          مسرد المصطلحات
        </h2>
        <p className="numeric mt-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          {entries.length} مصطلح · {totalRepeats} تكرار · {languages} زوج لغوي
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleClear}
          disabled={entries.length === 0}
          className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11px] font-bold text-rose-700 transition-colors duration-200 hover:bg-rose-500/20 disabled:opacity-40 dark:text-rose-300"
        >
          <Eraser className="size-3.5" aria-hidden />
          مسح الكل
        </button>
        <button
          type="button"
          onClick={requestClose}
          aria-label={controlled ? 'إغلاق مسرد المصطلحات' : 'طيّ مسرد المصطلحات'}
          title="إغلاق"
          className={actionClass}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );

  const controls = (
    <div className="mt-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <Search
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ابحث في المصطلح أو ترجمته أو ملاحظته…"
            aria-label="بحث في المسرد"
            className="w-full rounded-xl border border-slate-200 bg-white/80 py-2.5 pe-3 ps-9 text-sm text-slate-800 outline-none transition-colors duration-200 placeholder:text-slate-400 focus-visible:border-brand-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
          />
        </div>

        <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white/70 px-2 py-1 dark:border-slate-700/70 dark:bg-slate-900/60">
          <ArrowDownUp className="size-3.5 text-slate-400" aria-hidden />
          <select
            id="glossary-sort"
            value={sort}
            aria-label="ترتيب المسرد"
            onChange={(event) => setSort(event.target.value as SortId)}
            className="bg-transparent py-1.5 text-[11px] font-bold text-slate-700 outline-none dark:text-slate-200"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setPresetFilter('all')}
          aria-pressed={presetFilter === 'all'}
          className={cn(
            'rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors duration-200',
            presetFilter === 'all'
              ? 'border-brand-500/40 bg-brand-500/15 text-brand-700 dark:text-brand-200'
              : 'border-slate-200 bg-white/60 text-slate-500 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-400',
          )}
        >
          كل المجالات
        </button>
        {PRESET_OPTIONS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => setPresetFilter(preset.id)}
            aria-pressed={presetFilter === preset.id}
            className={cn(
              'rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors duration-200',
              presetFilter === preset.id
                ? 'border-brand-500/40 bg-brand-500/15 text-brand-700 dark:text-brand-200'
                : 'border-slate-200 bg-white/60 text-slate-500 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-400',
            )}
          >
            {preset.emoji} {preset.labelAr}
          </button>
        ))}
        <span className="numeric ms-auto text-[11px] font-semibold text-slate-400 dark:text-slate-500">
          {visible.length} من {entries.length}
        </span>
      </div>
    </div>
  );

  const grid =
    visible.length === 0 ? (
      <div className="mt-4 grid place-items-center rounded-2xl border border-dashed border-slate-300 bg-white/40 px-6 py-10 text-center dark:border-slate-700 dark:bg-slate-900/30">
        <div className="max-w-sm">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-slate-200 bg-white/70 text-slate-400 dark:border-slate-700/70 dark:bg-slate-900/60">
            <BookOpen className="size-6" aria-hidden />
          </div>
          <h3 className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-200">
            {entries.length === 0 ? 'المسرد فارغ حتى الآن' : 'لا مصطلحات مطابقة'}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            {entries.length === 0
              ? 'كل مصطلح متخصص يستخرجه المحرك من ترجماتك يُجمَع هنا مع عدد مرات ظهوره وملاحظته.'
              : 'جرّب تعديل كلمة البحث أو إزالة مرشّح المجال.'}
          </p>
        </div>
      </div>
    ) : (
      <ul className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((entry) => {
          const preset = findPreset(entry.preset);
          const source = findLanguage(entry.sourceLang);
          const target = findLanguage(entry.targetLang);
          const sourceLabel = entry.sourceLang === 'auto' ? 'تلقائي' : source?.short ?? entry.sourceLang.toUpperCase();
          const targetLabel = target?.short ?? entry.targetLang.toUpperCase();
          const note = entry.note.trim();

          return (
            <li
              key={entry.id}
              className="flex min-w-0 flex-col rounded-2xl border border-slate-200/80 bg-white/75 p-3 shadow-sm transition-colors duration-200 hover:border-brand-400/60 dark:border-slate-700/60 dark:bg-slate-900/60"
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-[10px] font-bold',
                    PRESET_TONE[entry.preset] ?? PRESET_TONE.general,
                  )}
                >
                  {preset.emoji} {preset.labelAr}
                </span>
                <span className="rounded-full border border-slate-200 bg-white/70 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-300">
                  {sourceLabel} ← {targetLabel}
                </span>
                <span className="numeric ms-auto inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/12 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                  <Star className="size-3 fill-amber-400 text-amber-500" aria-hidden />
                  {entry.count}×
                </span>
              </div>

              <p
                dir={detectDirection(entry.term)}
                style={{ unicodeBidi: 'plaintext' }}
                className="mt-2 text-sm font-extrabold leading-snug text-slate-900 dark:text-white"
              >
                {entry.term}
              </p>
              <p
                dir={detectDirection(entry.translation)}
                style={{ unicodeBidi: 'plaintext' }}
                className="text-body mt-1 text-xs font-semibold leading-relaxed text-brand-700 dark:text-brand-200"
              >
                {entry.translation || '—'}
              </p>
              {note ? (
                <p
                  dir={detectDirection(note)}
                  style={{ unicodeBidi: 'plaintext' }}
                  className="text-body mt-1.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400"
                >
                  {truncate(note, 180)}
                </p>
              ) : null}

              <div className="mt-auto flex items-center gap-1.5 pt-2.5">
                <button
                  type="button"
                  onClick={() => handleCopy(entry)}
                  aria-label="نسخ المصطلح وترجمته"
                  title="نسخ"
                  className={actionClass}
                >
                  {copiedId === entry.id ? (
                    <Check className="size-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
                  ) : (
                    <Copy className="size-4" aria-hidden />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => onSpeak(entry)}
                  aria-label="نطق ترجمة المصطلح"
                  title="نطق"
                  className={actionClass}
                >
                  <Volume2 className="size-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(entry.id)}
                  aria-label="حذف هذا المصطلح من المسرد"
                  title="حذف"
                  className={cn(actionClass, 'hover:border-rose-400 hover:text-rose-600 dark:hover:text-rose-300')}
                >
                  <Trash className="size-4" aria-hidden />
                </button>
                <span className="numeric ms-auto text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                  {safeRelativeTime(entry.lastSeenAt)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    );

  /* ---- الوضع المُتحكَّم به: لوحة منزلقة من جهة النهاية ---- */
  if (controlled) {
    const direction = typeof document === 'undefined' ? 'rtl' : document.documentElement.dir || 'rtl';
    const slideOffset = direction === 'ltr' ? '100%' : '-100%';
    return (
      <AnimatePresence>
        {isOpen ? (
          <div className="fixed inset-0 z-50" dir="rtl">
            <motion.button
              type="button"
              aria-label="إغلاق مسرد المصطلحات"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={requestClose}
              className="absolute inset-0 h-full w-full cursor-default bg-slate-950/55 backdrop-blur-sm"
            />
            <motion.section
              ref={panelRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label="مسرد المصطلحات"
              initial={{ x: slideOffset }}
              animate={{ x: 0 }}
              exit={{ x: slideOffset }}
              transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
              className="glass-panel absolute inset-y-0 end-0 flex w-full max-w-xl flex-col overflow-hidden rounded-s-3xl shadow-2xl shadow-slate-950/40 outline-none"
            >
              <div className="border-b border-slate-200/70 px-4 py-3.5 dark:border-slate-800/70">{header}</div>
              <div className="border-b border-slate-200/70 px-4 py-3 dark:border-slate-800/70">{controls}</div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{grid}</div>
            </motion.section>
          </div>
        ) : null}
      </AnimatePresence>
    );
  }

  /* ---- الوضع المضمَّن: قسم قابل للطيّ ---- */
  return (
    <section aria-label="مسرد المصطلحات" className="glass-panel rounded-3xl p-4 shadow-xl shadow-slate-900/5 sm:p-5">
      {header}
      {isOpen ? (
        <>
          {controls}
          {grid}
        </>
      ) : (
        <button
          type="button"
          onClick={() => setLocalOpen(true)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-brand-500/30 bg-brand-500/10 px-3 py-2 text-xs font-bold text-brand-700 transition-colors duration-200 hover:bg-brand-500/20 dark:text-brand-200"
        >
          <Sparkles className="size-3.5" aria-hidden />
          استعراض المسرد ({entries.length})
        </button>
      )}
    </section>
  );
};

export default GlossaryPanel;
