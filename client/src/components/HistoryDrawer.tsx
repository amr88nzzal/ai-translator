/**
 * سجل الترجمات — لوحة منزلقة من جهة النهاية (`end-0`) مع طبقة تعتيم.
 *
 * تعرض كل عناصر السجل مع بحث فوري، ومرشّحات (المفضلة فقط + المجال)، وأزرار
 * النسخ والنطق والنجمة والحذف و«استخدام»، وتذييل للتصدير ومسح الكل.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Clock3,
  Copy,
  Download,
  Eraser,
  FileText,
  Search,
  Sparkles,
  Star,
  Trash,
  VolumeOff,
  Volume2,
  X,
} from 'lucide-react';
import { PRESET_OPTIONS, findLanguage, findPreset, findTone } from '@/constants';
import type { HistoryItem, PresetId } from '@/types';
import { cn, detectDirection, relativeTime, truncate } from '@/lib/utils';

export interface HistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  items: HistoryItem[];
  onToggleFavorite: (id: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onCopy: (item: HistoryItem) => void;
  onSpeak: (item: HistoryItem) => void;
  onSelect: (item: HistoryItem) => void;
  onExportJson: () => void;
  onExportText: () => void;
  speakingId: string | null;
  speechSupported: boolean;
}

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
  'grid size-8 place-items-center rounded-xl border border-slate-200/80 bg-white/70 text-slate-600 transition-colors duration-200 hover:border-brand-400 hover:text-brand-700 disabled:opacity-40 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:border-brand-500/60 dark:hover:text-brand-200';

const timeLabel = (timestamp: number): string => {
  try {
    return relativeTime(timestamp);
  } catch {
    return 'الآن';
  }
};

export const HistoryDrawer = ({
  open,
  onClose,
  items,
  onToggleFavorite,
  onDelete,
  onClearAll,
  onCopy,
  onSpeak,
  onSelect,
  onExportJson,
  onExportText,
  speakingId,
  speechSupported,
}: HistoryDrawerProps): React.JSX.Element => {
  const [query, setQuery] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [presetFilter, setPresetFilter] = useState<PresetId | 'all'>('all');
  const panelRef = useRef<HTMLElement | null>(null);

  /* قفل تمرير الصفحة + إغلاق بمفتاح Escape أثناء الفتح */
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    panelRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  const termText = (item: HistoryItem): string =>
    item.keyTerms.map((term) => `${term.term} ${term.translation} ${term.note}`).join(' ');

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (favoritesOnly && !item.favorite) return false;
      if (presetFilter !== 'all' && item.preset !== presetFilter) return false;
      if (!needle) return true;
      const haystack = [
        item.sourceText,
        item.transcription,
        item.translation,
        item.detectedLanguage,
        termText(item),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [items, query, favoritesOnly, presetFilter]);

  const favoritesCount = useMemo(() => items.filter((item) => item.favorite).length, [items]);
  const hasFilter = query.trim().length > 0 || favoritesOnly || presetFilter !== 'all';
  const dialogDirection = typeof document === 'undefined' ? 'rtl' : document.documentElement.dir || 'rtl';
  /* اللوحة مثبّتة على جهة النهاية: تنزلق من خارج الشاشة ثم تستقر في مكانها. */
  const slideOffset = dialogDirection === 'ltr' ? '100%' : '-100%';

  const handleClearAll = (): void => {
    if (typeof window !== 'undefined' && !window.confirm('سيتم حذف كل عناصر السجل نهائيًا. هل تريد المتابعة؟')) {
      return;
    }
    onClearAll();
  };

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50" dir={dialogDirection === 'ltr' ? 'ltr' : 'rtl'}>
          <motion.button
            type="button"
            aria-label="إغلاق سجل الترجمات"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 h-full w-full cursor-default bg-slate-950/55 backdrop-blur-sm"
          />

          <motion.aside
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="سجل الترجمات"
            initial={{ x: slideOffset }}
            animate={{ x: 0 }}
            exit={{ x: slideOffset }}
            transition={{ type: 'tween', duration: 0.25, ease: 'easeOut' }}
            className="glass-panel absolute inset-y-0 end-0 flex w-full max-w-md flex-col overflow-hidden rounded-s-3xl shadow-2xl shadow-slate-950/40 outline-none"
          >
            <header className="flex items-start justify-between gap-3 border-b border-slate-200/70 px-4 py-3.5 dark:border-slate-800/70">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-base font-extrabold text-slate-900 dark:text-white">
                  <Clock3 className="size-5 text-brand-600 dark:text-brand-300" aria-hidden />
                  سجل الترجمات
                </h2>
                <p className="numeric mt-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  {items.length} عنصر محفوظ · {favoritesCount} في المفضلة
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="إغلاق السجل"
                title="إغلاق"
                className={actionClass}
              >
                <X className="size-4" aria-hidden />
              </button>
            </header>

            <div className="border-b border-slate-200/70 px-4 py-3 dark:border-slate-800/70">
              <div className="relative">
                <Search
                  className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
                  aria-hidden
                />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="ابحث في النص أو الترجمة أو المصطلحات…"
                  aria-label="بحث في السجل"
                  className="w-full rounded-xl border border-slate-200 bg-white/80 py-2.5 pe-3 ps-9 text-sm text-slate-800 outline-none transition-colors duration-200 placeholder:text-slate-400 focus-visible:border-brand-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
                />
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFavoritesOnly((current) => !current)}
                  aria-pressed={favoritesOnly}
                  className={cn(
                    'flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-bold transition-colors duration-200',
                    favoritesOnly
                      ? 'border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300'
                      : 'border-slate-200 bg-white/70 text-slate-600 hover:text-brand-700 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-300',
                  )}
                >
                  <Star className={cn('size-3.5', favoritesOnly && 'fill-amber-400')} aria-hidden />
                  المفضلة فقط
                </button>

                <span className="numeric rounded-full border border-slate-200 bg-white/60 px-2.5 py-1 text-[11px] font-bold text-slate-600 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-300">
                  {filtered.length} من {items.length}
                </span>

                {hasFilter ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      setFavoritesOnly(false);
                      setPresetFilter('all');
                    }}
                    className="text-[11px] font-bold text-brand-700 underline-offset-4 transition-colors hover:underline dark:text-brand-300"
                  >
                    إزالة المرشّحات
                  </button>
                ) : null}
              </div>

              <div className="no-scrollbar mt-2.5 flex gap-1.5 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setPresetFilter('all')}
                  aria-pressed={presetFilter === 'all'}
                  className={cn(
                    'shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors duration-200',
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
                      'shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors duration-200',
                      presetFilter === preset.id
                        ? 'border-brand-500/40 bg-brand-500/15 text-brand-700 dark:text-brand-200'
                        : 'border-slate-200 bg-white/60 text-slate-500 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-400',
                    )}
                  >
                    {preset.emoji} {preset.labelAr}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              {filtered.length === 0 ? (
                <div className="grid h-full place-items-center px-6 py-10 text-center">
                  <div className="max-w-xs">
                    <div className="mx-auto grid size-14 place-items-center rounded-2xl border border-slate-200 bg-white/70 text-slate-400 dark:border-slate-700/70 dark:bg-slate-900/60">
                      <Clock3 className="size-6" aria-hidden />
                    </div>
                    <h3 className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-200">
                      {items.length === 0 ? 'لا توجد ترجمات محفوظة بعد' : 'لا نتائج مطابقة'}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                      {items.length === 0
                        ? 'ستظهر كل ترجمة تُنجزها هنا تلقائيًا مع المجال والنمط والوقت.'
                        : 'جرّب تعديل كلمة البحث أو إزالة مرشّح المجال والمفضلة.'}
                    </p>
                  </div>
                </div>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {filtered.map((item) => {
                    const preset = findPreset(item.preset);
                    const tone = findTone(item.tone);
                    const source = findLanguage(item.sourceLang);
                    const target = findLanguage(item.targetLang);
                    const sourceLabel = item.sourceLang === 'auto' ? 'كشف تلقائي' : source?.nativeLabel ?? item.sourceLang;
                    const targetLabel = target?.nativeLabel ?? item.targetLang;
                    const excerpt = truncate(item.transcription || item.sourceText || item.translation, 150);

                    return (
                      <li
                        key={item.id}
                        className="rounded-2xl border border-slate-200/80 bg-white/75 p-3 shadow-sm transition-colors duration-200 hover:border-brand-400/60 dark:border-slate-700/60 dark:bg-slate-900/60"
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/70 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-300">
                            {item.kind === 'audio' ? '🎙️ صوت' : '✍️ نص'}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-white/70 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-300">
                            {sourceLabel} ← {targetLabel}
                          </span>
                          <span
                            className={cn(
                              'rounded-full border px-2 py-0.5 text-[10px] font-bold',
                              PRESET_TONE[item.preset] ?? PRESET_TONE.general,
                            )}
                          >
                            {preset.emoji} {preset.labelAr}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-white/70 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-400">
                            {tone.emoji} {tone.labelAr}
                          </span>
                          <span className="numeric ms-auto text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                            {timeLabel(item.createdAt)}
                          </span>
                        </div>

                        {excerpt ? (
                          <p
                            dir={detectDirection(excerpt)}
                            style={{ unicodeBidi: 'plaintext' }}
                            className="text-body mt-2 text-xs leading-relaxed text-slate-700 dark:text-slate-200"
                          >
                            {excerpt}
                          </p>
                        ) : null}

                        <p
                          dir={detectDirection(item.translation)}
                          style={{ unicodeBidi: 'plaintext' }}
                          className="text-body mt-1.5 border-s-2 border-brand-500/40 ps-2 text-xs font-semibold leading-relaxed text-slate-900 dark:text-white"
                        >
                          {truncate(item.translation, 170)}
                        </p>

                        <div className="mt-2.5 flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onCopy(item)}
                            aria-label="نسخ ترجمة هذا العنصر"
                            title="نسخ"
                            className={actionClass}
                          >
                            <Copy className="size-4" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => onSpeak(item)}
                            disabled={!speechSupported}
                            aria-label={speakingId === item.id ? 'إيقاف نطق هذا العنصر' : 'نطق ترجمة هذا العنصر'}
                            title={speechSupported ? 'نطق' : 'النطق غير مدعوم في هذا المتصفح'}
                            className={cn(actionClass, speakingId === item.id && 'border-brand-500 text-brand-600')}
                          >
                            {speechSupported ? (
                              <Volume2 className={cn('size-4', speakingId === item.id && 'animate-pulse')} aria-hidden />
                            ) : (
                              <VolumeOff className="size-4" aria-hidden />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => onToggleFavorite(item.id)}
                            aria-label={item.favorite ? 'إزالة هذا العنصر من المفضلة' : 'إضافة هذا العنصر إلى المفضلة'}
                            title={item.favorite ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
                            className={cn(actionClass, item.favorite && 'border-amber-500/50 text-amber-600 dark:text-amber-300')}
                          >
                            <Star className={cn('size-4', item.favorite && 'fill-amber-400')} aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(item.id)}
                            aria-label="حذف هذا العنصر من السجل"
                            title="حذف"
                            className={cn(actionClass, 'hover:border-rose-400 hover:text-rose-600 dark:hover:text-rose-300')}
                          >
                            <Trash className="size-4" aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => onSelect(item)}
                            className="ms-auto inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-sm shadow-brand-500/25 transition-colors duration-200 hover:bg-brand-500"
                          >
                            <Sparkles className="size-3.5" aria-hidden />
                            استخدام
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <footer className="border-t border-slate-200/70 px-4 py-3 dark:border-slate-800/70">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onExportJson}
                  disabled={items.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-[11px] font-bold text-slate-700 transition-colors duration-200 hover:border-brand-400 hover:text-brand-700 disabled:opacity-40 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-200"
                >
                  <Download className="size-3.5" aria-hidden />
                  تصدير JSON
                </button>
                <button
                  type="button"
                  onClick={onExportText}
                  disabled={items.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-[11px] font-bold text-slate-700 transition-colors duration-200 hover:border-brand-400 hover:text-brand-700 disabled:opacity-40 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-200"
                >
                  <FileText className="size-3.5" aria-hidden />
                  تصدير نصي
                </button>
                <button
                  type="button"
                  onClick={handleClearAll}
                  disabled={items.length === 0}
                  className="ms-auto inline-flex items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11px] font-bold text-rose-700 transition-colors duration-200 hover:bg-rose-500/20 disabled:opacity-40 dark:text-rose-300"
                >
                  <Eraser className="size-3.5" aria-hidden />
                  مسح الكل
                </button>
              </div>
            </footer>
            </motion.aside>
          </div>
        ) : null}
    </AnimatePresence>
  );
};

export default HistoryDrawer;
