/**
 * Target card: the finished translation with its speech, copy, favourite and
 * share actions plus an integrated player for the synthesised/recorded audio.
 */
import { useState, type FC } from 'react';
import { motion } from 'motion/react';
import { AudioLines, Check, Copy, Languages, Share2, Star, Volume2 } from 'lucide-react';
import { IconButton } from '@/components/results/GhostButton';
import { detectDirection } from '@/lib/utils';

export interface TargetCardProps {
  translation: string;
  targetLangLabel: string;
  targetLangCode: string;
  audioUrl?: string;
  onSpeak: () => void;
  speaking: boolean;
  speechSupported: boolean;
  onCopy: () => void;
  onStar: () => void;
  onShare: () => void;
  starred: boolean;
}

export const TargetCard: FC<TargetCardProps> = ({
  translation,
  targetLangLabel,
  targetLangCode,
  audioUrl,
  onSpeak,
  speaking,
  speechSupported,
  onCopy,
  onStar,
  onShare,
  starred,
}) => {
  const [copied, setCopied] = useState(false);
  const body = translation.trim() ? translation : 'لا توجد ترجمة للعرض بعد.';

  const handleCopy = (): void => {
    onCopy();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      aria-label="الترجمة"
      className="flex min-w-0 flex-col gap-3 rounded-2xl border border-brand-500/25 bg-white/80 p-4 backdrop-blur-xl dark:border-brand-400/25 dark:bg-slate-900/70"
    >
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-600 text-white shadow-sm shadow-brand-500/25"
            aria-hidden
          >
            <Languages className="size-4" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-extrabold text-slate-900 dark:text-white">الترجمة</h3>
            <p className="truncate text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              إلى: {targetLangLabel} · {targetLangCode ? targetLangCode.toUpperCase() : '—'}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <IconButton
            label={speaking ? 'إيقاف نطق الترجمة' : 'نطق الترجمة'}
            onClick={onSpeak}
            active={speaking}
            disabled={!speechSupported}
            title={speechSupported ? 'نطق الترجمة' : 'النطق غير مدعوم في هذا المتصفح'}
          >
            {speaking ? (
              <AudioLines className="size-4 animate-pulse" aria-hidden />
            ) : (
              <Volume2 className="size-4" aria-hidden />
            )}
          </IconButton>

          <IconButton
            label={copied ? 'تم نسخ الترجمة' : 'نسخ الترجمة'}
            onClick={handleCopy}
            active={copied}
            title="نسخ الترجمة"
          >
            {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          </IconButton>

          <IconButton
            label={starred ? 'إزالة الترجمة من المفضلة' : 'إضافة الترجمة إلى المفضلة'}
            onClick={onStar}
            active={starred}
            title={starred ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
          >
            <Star className={starred ? 'size-4 fill-current' : 'size-4'} aria-hidden />
          </IconButton>

          <IconButton label="مشاركة الترجمة" onClick={onShare} title="مشاركة الترجمة">
            <Share2 className="size-4" aria-hidden />
          </IconButton>
        </div>
      </header>

      {audioUrl ? (
        <audio
          controls
          preload="metadata"
          src={audioUrl}
          aria-label="تسجيل الترجمة"
          className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50/80 dark:border-slate-700/60 dark:bg-slate-950/60"
        />
      ) : null}

      <p
        dir={detectDirection(body)}
        style={{ unicodeBidi: 'plaintext' }}
        className="text-body min-w-0 rounded-xl bg-brand-50/70 p-3 text-sm font-semibold text-slate-900 dark:bg-brand-950/25 dark:text-slate-50"
      >
        {body}
      </p>
    </motion.section>
  );
};

export default TargetCard;
