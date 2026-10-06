/**
 * RecorderCard — بطاقة التسجيل الصوتي بكل الأنماط الثلاثة.
 *
 * - `toggle`     : زر واحد كبير يبدأ ويوقف التسجيل (`onToggle`).
 * - `hold`       : اضغط واستمر (pointer + keyboard) مع `onPressStart`/`onPressEnd`.
 * - `continuous` : بث مباشر مع شارة نابضة وعدّاد للمقطع الحالي ومنزلق حسّاسية VAD.
 *
 * البطاقة أيضًا مسؤولة عن: منتقي الميكروفون، رفع ملف صوتي ("تحويل الملفات")،
 * لافتة الأخطاء العربية مع زر إغلاق، وتحذير المتصفح غير المدعوم.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AudioLines,
  Ban,
  Hand,
  LoaderCircle,
  Mic,
  MicOff,
  RefreshCw,
  Square,
  TriangleAlert,
  Upload,
  X,
} from 'lucide-react';

import { AudioVisualizer } from '@/components/ui/AudioVisualizer';
import { MAX_UPLOAD_BYTES, RECORDER_MODE_LABELS, VAD_SILENCE_MAX, VAD_SILENCE_MIN } from '@/constants';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { blobToBase64, cn, formatBytes, formatDuration } from '@/lib/utils';
import type { AudioDeviceSummary, RecorderLevels, RecorderMode, RecordingPhase } from '@/types';

export interface RecorderCardProps {
  mode: RecorderMode;
  phase: RecordingPhase;
  isRecording: boolean;
  elapsedMs: number;
  segmentElapsedMs: number;
  levelsRef: React.RefObject<RecorderLevels>;
  recorderError: string | null;
  supported: boolean;
  mimeType: string;
  devices: AudioDeviceSummary[];
  selectedDeviceId: string;
  vadSilenceMs: number;
  minSegmentMs: number;
  onSelectDevice: (deviceId: string) => void;
  onToggle: () => void;
  onPressStart: () => void;
  onPressEnd: () => void;
  onCancel: () => void;
  onSubmitAudio: (batch: { base64: string; mimeType: string; durationMs: number; audioUrl: string }) => void;
  onError: (message: string) => void;
  onSensitivityChange: (silenceMs: number) => void;
  onClearError: () => void;
}

const MAX_UPLOAD_HINT = formatBytes(MAX_UPLOAD_BYTES);

/** وصف الحالة الحالية بالعربية، مشتقّ من طور التسجيل. */
const PHASE_LABELS: Record<RecordingPhase, string> = {
  idle: 'جاهز للتسجيل',
  requesting: 'بانتظار إذن الميكروفون…',
  recording: 'جارٍ التسجيل',
  paused: 'التسجيل متوقف مؤقتًا',
  processing: 'جارٍ التفريغ والترجمة…',
  error: 'حدث خطأ في التسجيل',
};

export const RecorderCard: React.FC<RecorderCardProps> = ({
  mode,
  phase,
  isRecording,
  elapsedMs,
  segmentElapsedMs,
  levelsRef,
  recorderError,
  supported,
  mimeType,
  devices,
  selectedDeviceId,
  vadSilenceMs,
  minSegmentMs,
  onSelectDevice,
  onToggle,
  onPressStart,
  onPressEnd,
  onCancel,
  onSubmitAudio,
  onError,
  onSensitivityChange,
  onClearError,
}) => {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [holding, setHolding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const selectId = useId();
  const sensitivityId = useId();

  const modeLabels = RECORDER_MODE_LABELS[mode];
  const busy = phase === 'requesting' || phase === 'processing';
  const isContinuous = mode === 'continuous';
  const isHold = mode === 'hold';
  const canRecord = supported && !busy;

  // لو انتهى التسجيل خارج الزر (مهلة/خطأ) نُصفّر حالة الضغط المستمر.
  useEffect(() => {
    if (!isRecording && holding) setHolding(false);
  }, [isRecording, holding]);

  const handlePressStart = (): void => {
    if (!canRecord) return;
    setHolding(true);
    onPressStart();
  };

  const handlePressEnd = (): void => {
    setHolding(false);
    onPressEnd();
  };

  const handleSelectFile = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    // يُصفَّر دائمًا حتى يمكن اختيار نفس الملف مرة أخرى.
    event.target.value = '';
    if (!file) return;

    if (file.size > MAX_UPLOAD_BYTES) {
      onError(`حجم الملف ${formatBytes(file.size)} يتجاوز الحد المسموح (${MAX_UPLOAD_HINT}). اختر ملفًا أصغر.`);
      return;
    }

    setUploading(true);
    const audioUrl = URL.createObjectURL(file);
    void blobToBase64(file)
      .then((base64) => {
        if (!base64) {
          URL.revokeObjectURL(audioUrl);
          onError('تعذّر قراءة الملف الصوتي. تأكد من أن الملف غير تالف.');
          return;
        }
        onSubmitAudio({ base64, mimeType: file.type || 'audio/webm', durationMs: 0, audioUrl });
      })
      .catch(() => {
        URL.revokeObjectURL(audioUrl);
        onError('تعذّر قراءة الملف الصوتي. جرّب ملفًا آخر.');
      })
      .finally(() => setUploading(false));
  };

  const ringAnimated = isRecording && !reducedMotion;

  return (
    <section
      dir="rtl"
      className="glass-panel relative flex flex-col gap-4 overflow-hidden rounded-2xl p-4 shadow-lg shadow-indigo-500/10 sm:p-5"
      aria-label="لوحة التسجيل الصوتي"
    >
      {/* ---------------------------------------------------------- الترويسة */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-extrabold text-slate-800 dark:text-slate-100">
            <AudioLines className="size-4 text-indigo-600 dark:text-indigo-400" aria-hidden />
            {modeLabels.ar}
            <span aria-hidden>{modeLabels.emoji}</span>
          </h2>
          <p className="mt-1 text-xs leading-5 font-semibold text-slate-500 dark:text-slate-400">
            {modeLabels.descriptionAr}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors duration-200',
              isRecording
                ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300'
                : phase === 'processing'
                  ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
                  : 'border-slate-300/70 bg-slate-500/5 text-slate-600 dark:border-slate-600/60 dark:text-slate-300',
            )}
          >
            <span className="relative flex size-2" aria-hidden>
              {isRecording && !reducedMotion ? (
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-rose-500 opacity-70" />
              ) : null}
              <span
                className={cn(
                  'relative inline-flex size-2 rounded-full',
                  isRecording ? 'bg-rose-500' : phase === 'processing' ? 'bg-indigo-500' : 'bg-slate-400 dark:bg-slate-500',
                )}
              />
            </span>
            {PHASE_LABELS[phase]}
          </span>

          {isContinuous && isRecording ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-[11px] font-extrabold text-rose-700 dark:text-rose-300">
              <span className="relative flex size-2" aria-hidden>
                {!reducedMotion ? (
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-rose-500 opacity-75" />
                ) : null}
                <span className="relative inline-flex size-2 rounded-full bg-rose-500" />
              </span>
              بث مباشر
            </span>
          ) : null}

          <span className="rounded-full border border-slate-200/80 bg-white/60 px-2.5 py-1 text-[11px] font-bold text-slate-600 tabular-nums dark:border-slate-700/60 dark:bg-slate-900/50 dark:text-slate-300">
            {formatDuration(elapsedMs)}
          </span>
        </div>
      </header>

      {/* ------------------------------------------------------ لافتة الخطأ */}
      <AnimatePresence initial={false}>
        {recorderError ? (
          <motion.div
            key="recorder-error"
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={reducedMotion ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
            exit={reducedMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl border border-rose-400/50 bg-rose-500/10 p-3"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-300" aria-hidden>
                <TriangleAlert className="size-4" />
              </span>
              <p
                className="min-w-0 flex-1 text-xs leading-6 font-semibold text-rose-800 dark:text-rose-100"
                dir="auto"
                style={{ unicodeBidi: 'plaintext' }}
              >
                {recorderError}
              </p>
              <button
                type="button"
                onClick={onClearError}
                className="shrink-0 rounded-lg bg-rose-600 px-3 py-1.5 text-[11px] font-extrabold text-white transition-colors duration-200 hover:bg-rose-500"
              >
                حسنًا
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ------------------------------------------- تحذير المتصفح غير المدعوم */}
      {!supported ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-400/50 bg-amber-500/10 p-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-300" aria-hidden>
            <Ban className="size-4" />
          </span>
          <div className="min-w-0 text-xs leading-6 font-semibold text-amber-900 dark:text-amber-100">
            <p className="font-extrabold">التسجيل الصوتي غير مدعوم في هذا المتصفح</p>
            <p className="text-amber-800/90 dark:text-amber-200/90">
              تحتاج هذه الميزة إلى `MediaRecorder` وإذن الميكروفون. استخدم Chrome أو Edge أو Safari حديثًا، أو استخدم
              زر «تحويل ملف صوتي» بالأسفل.
            </p>
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------------------ بطاقة الإرشاد */}
      {isContinuous ? (
        <div className="rounded-xl border border-indigo-400/40 bg-indigo-500/10 p-3 text-xs leading-6 font-semibold text-indigo-900 dark:text-indigo-100">
          <p className="flex items-center gap-2 font-extrabold">
            <AudioLines className="size-4 shrink-0 text-indigo-600 dark:text-indigo-300" aria-hidden />
            الوضع المستمر — يعمل كمساعد استماع
          </p>
          <p className="mt-1 text-indigo-800/90 dark:text-indigo-200/90">
            يبقى الميكروفون مفتوحًا ويُقسَّم الكلام تلقائيًا: يُرسل كل مقطع عند السكوت لمدة{' '}
            <span className="font-extrabold tabular-nums">{(vadSilenceMs / 1000).toFixed(1)}</span> ثانية، أو عند بلوغ
            مدة قياسية للمقطع، وتظهر النتائج في بث المقاطع أسفل الصفحة.
          </p>
        </div>
      ) : null}

      {/* ---------------------------------------- منتقي الميكروفون + نوع الترميز */}
      <div className="flex flex-wrap items-end gap-3">
        {devices.length > 1 ? (
          <div className="min-w-[240px] flex-1">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label htmlFor={selectId} className="text-[11px] font-extrabold text-slate-600 dark:text-slate-300">
                الميكروفون المُستخدم
              </label>
              <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">يمكنك التبديل أثناء التوقف</span>
            </div>
            <div className="relative">
              <select
                id={selectId}
                value={selectedDeviceId}
                onChange={(event) => onSelectDevice(event.target.value)}
                disabled={isRecording}
                className="w-full appearance-none rounded-xl border border-slate-200/90 bg-white/80 py-2 ps-3 pe-9 text-xs font-bold text-slate-700 transition-colors duration-200 hover:border-indigo-400 focus:border-indigo-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-200"
              >
                {devices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute inset-y-0 end-3 grid place-items-center text-slate-400" aria-hidden>
                <Mic className="size-4" />
              </span>
            </div>
          </div>
        ) : (
          <div className="flex-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            {devices.length === 1 ? `الميكروفون: ${devices[0]?.label ?? 'الافتراضي'}` : 'سيُطلب إذن الميكروفون عند بدء التسجيل.'}
          </div>
        )}

        <div className="flex items-center gap-2">
          <span className="rounded-lg border border-slate-200/80 bg-white/60 px-2 py-1 text-[10px] font-bold text-slate-500 tabular-nums dark:border-slate-700/60 dark:bg-slate-900/50 dark:text-slate-400">
            {mimeType ? mimeType.split(';')[0] : 'ترميز افتراضي'}
          </span>
          <span className="rounded-lg border border-slate-200/80 bg-white/60 px-2 py-1 text-[10px] font-bold text-slate-500 tabular-nums dark:border-slate-700/60 dark:bg-slate-900/50 dark:text-slate-400">
            أقصر مقطع {(minSegmentMs / 1000).toFixed(2)} ث
          </span>
        </div>
      </div>

      {/* ------------------------------------------------- منزلق حسّاسية VAD */}
      {isContinuous ? (
        <div className="rounded-xl border border-slate-200/80 bg-white/50 p-3 dark:border-slate-700/60 dark:bg-slate-900/40">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={sensitivityId} className="text-[11px] font-extrabold text-slate-700 dark:text-slate-200">
              حسّاسية كشف السكوت
            </label>
            <span className="rounded-lg bg-indigo-500/10 px-2 py-0.5 text-[11px] font-extrabold text-indigo-700 tabular-nums dark:text-indigo-300">
              {(vadSilenceMs / 1000).toFixed(1)} ث
            </span>
          </div>
          <input
            id={sensitivityId}
            type="range"
            min={VAD_SILENCE_MIN}
            max={VAD_SILENCE_MAX}
            step={100}
            value={vadSilenceMs}
            disabled={busy}
            onChange={(event) => onSensitivityChange(Number(event.target.value))}
            className="mt-3 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-indigo-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-700"
            aria-valuetext={`${(vadSilenceMs / 1000).toFixed(1)} ثانية من السكوت`}
          />
          <div className="mt-1.5 flex items-center justify-between text-[10px] font-semibold text-slate-400 dark:text-slate-500">
            <span>أسرع ({(VAD_SILENCE_MIN / 1000).toFixed(1)} ث)</span>
            <span>أبطأ ({(VAD_SILENCE_MAX / 1000).toFixed(1)} ث)</span>
          </div>
          <p className="mt-1 text-[10px] leading-5 font-semibold text-slate-500 dark:text-slate-400">
            القيمة الأصغر تقسّم الكلام بسرعة أكبر وتناسب المحادثات، والأكبر تنتظر اكتمال الجُمل الطويلة.
          </p>
        </div>
      ) : null}

      {/* ------------------------------------------------------ المرسام الصوتي */}
      <div className="relative overflow-hidden rounded-xl border border-slate-200/70 bg-slate-50/60 dark:border-slate-700/50 dark:bg-slate-950/40">
        <AudioVisualizer
          levelsRef={levelsRef}
          active={isRecording}
          variant="wave"
          height={72}
          accent="#6366f1"
          className="px-2"
        />
        {isRecording && !isContinuous ? (
          <span className="absolute end-2 top-2 rounded-full bg-slate-900/60 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
            مستوى الصوت
          </span>
        ) : null}
      </div>

      {/* -------------------------------------------------------- زر التسجيل */}
      <div className="relative flex flex-col items-center gap-3 py-2">
        {ringAnimated ? (
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 start-0 end-0 mx-auto size-28 -translate-y-1/2 rounded-full bg-indigo-500/25"
            style={{ animation: 'var(--animate-pulse-ring)' }}
          />
        ) : null}

        <AudioVisualizer
          levelsRef={levelsRef}
          active={isRecording}
          variant="pulse"
          height={148}
          accent="#6366f1"
          className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2"
        />

        <button
          type="button"
          aria-label={modeLabels.ar}
          aria-pressed={!isHold ? isRecording : undefined}
          disabled={!canRecord}
          onClick={isHold ? undefined : onToggle}
          onPointerDown={
            isHold
              ? (event) => {
                  event.preventDefault();
                  handlePressStart();
                }
              : undefined
          }
          onPointerUp={isHold ? handlePressEnd : undefined}
          onPointerLeave={isHold ? handlePressEnd : undefined}
          onPointerCancel={isHold ? handlePressEnd : undefined}
          onContextMenu={isHold ? (event) => event.preventDefault() : undefined}
          onKeyDown={
            isHold
              ? (event) => {
                  if (event.key !== ' ' && event.key !== 'Enter') return;
                  event.preventDefault();
                  if (!event.repeat) handlePressStart();
                }
              : undefined
          }
          onKeyUp={
            isHold
              ? (event) => {
                  if (event.key !== ' ' && event.key !== 'Enter') return;
                  event.preventDefault();
                  handlePressEnd();
                }
              : undefined
          }
          style={isHold ? { touchAction: 'none' } : undefined}
          className={cn(
            'relative z-10 grid size-24 place-items-center rounded-full text-white shadow-xl transition-all duration-200 select-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-500',
            isRecording
              ? 'scale-105 bg-gradient-to-br from-rose-500 to-red-600 shadow-rose-500/40 hover:from-rose-400'
              : 'bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-indigo-500/35 hover:from-indigo-400 active:scale-95',
            !canRecord && 'cursor-not-allowed opacity-60',
          )}
        >
          {busy ? (
            <LoaderCircle className="size-9 animate-spin" aria-hidden />
          ) : isRecording ? (
            <Square className="size-8" aria-hidden />
          ) : (
            <Mic className="size-10" aria-hidden />
          )}
        </button>

        <p className="text-center text-sm font-extrabold text-slate-700 dark:text-slate-200">
          {busy
            ? phase === 'requesting'
              ? 'بانتظار إذن الميكروفون…'
              : 'جارٍ التحليل…'
            : isRecording
              ? isHold
                ? 'اترك الزر للإرسال'
                : 'اضغط للإيقاف والإرسال'
              : isHold
                ? 'اضغط مع الاستمرار للتسجيل'
                : modeLabels.ar}
        </p>
        <p className="text-center text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          {phase === 'requesting'
            ? 'اسمح بالوصول إلى الميكروفون من نافذة المتصفح.'
            : isContinuous
              ? 'يُرسل كل مقطع تلقائيًا عند السكوت — لا حاجة للإيقاف.'
              : 'المقطع يُرسل للترجمة فور الإيقاف أو رفع الضغط.'}
        </p>
      </div>

      {/* ------------------------------------- عدّاد المقطع الحالي (المستمر) */}
      {isContinuous ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white/60 px-3 py-2 dark:border-slate-700/60 dark:bg-slate-900/50">
          <span className="text-[11px] font-extrabold text-slate-600 dark:text-slate-300">مدة المقطع الحالي</span>
          <span className="numeric text-lg font-extrabold text-indigo-700 dark:text-indigo-300">
            {formatDuration(segmentElapsedMs)}
          </span>
        </div>
      ) : null}

      {/* ----------------------------------------------------- أزرار مساعدة */}
      <div className="flex flex-wrap items-center justify-center gap-2 border-t border-slate-200/70 pt-3 dark:border-slate-700/50">
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={handleSelectFile}
          aria-label="اختيار ملف صوتي للترجمة"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy || uploading}
          aria-label="رفع ملف صوتي من الجهاز لترجمته"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200/90 bg-white/70 px-3 py-2 text-[11px] font-extrabold text-slate-600 transition-colors duration-200 hover:border-indigo-400 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700/60 dark:bg-slate-900/50 dark:text-slate-300 dark:hover:text-indigo-300"
        >
          {uploading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
          تحويل ملف صوتي
        </button>

        <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
          الحد الأقصى {MAX_UPLOAD_HINT} — الصيغ المدعومة: webm · mp3 · wav · m4a · ogg
        </span>

        <AnimatePresence initial={false}>
          {(isRecording || busy) && (
            <motion.button
              key="cancel"
              type="button"
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
              animate={reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
              transition={{ duration: 0.18 }}
              onClick={onCancel}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300/80 bg-slate-500/5 px-3 py-2 text-[11px] font-extrabold text-slate-600 transition-colors duration-200 hover:border-rose-400 hover:text-rose-700 dark:border-slate-600/70 dark:text-slate-300 dark:hover:text-rose-300"
            >
              <X className="size-4" aria-hidden />
              إلغاء
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* تلميح جهاز: يظهر فقط عند عدم وجود أي ميكروفون مكتشف بعد. */}
      {supported && devices.length === 0 ? (
        <p className="flex items-center justify-center gap-2 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
          <RefreshCw className="size-3" aria-hidden />
          لم تُكتشف ميكروفونات بعد — ستظهر القائمة بعد منح الإذن.
        </p>
      ) : null}

      {!supported ? (
        <p className="flex items-center justify-center gap-2 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
          <MicOff className="size-3" aria-hidden />
          زر التسجيل معطّل حتى تستخدم متصفحًا يدعم التقاط الصوت.
        </p>
      ) : null}

      {isHold && !isRecording ? (
        <p className="flex items-center justify-center gap-2 text-[10px] font-semibold text-slate-400 dark:text-slate-500">
          <Hand className="size-3" aria-hidden />
          نصيحة: يمكنك أيضًا الاستمرار بالضغط على مفتاح المسافة أثناء التركيز على الزر.
        </p>
      ) : null}
    </section>
  );
};

export default RecorderCard;
