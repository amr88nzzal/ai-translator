/**
 * AudioVisualizer — مرسام الصوت الحيّ لمحرّك التسجيل.
 *
 * مبدأ التصميم: هذا المكوّن **لا يعيد الرسم عبر React أبدًا**. يقرأ
 * `levelsRef.current` داخل حلقة `requestAnimationFrame` خاصة به ويرسم على
 * `<canvas>`، لذا لا تُسبّب كل عيّنة صوتية إعادة رندر لشجرة React.
 *
 * الأنماط:
 *  - `bars`  : أعمدة ترددات (48 دلوًا) تنمو من قاعدة اللوحة.
 *  - `wave`  : موجة زمنية انسيابية تتّسع مع علو الصوت.
 *  - `pulse` : حلقات نابضة تصلح كطبقة خلف زر التسجيل.
 *
 * يُحترم `prefers-reduced-motion` (نبضات أهدأ وأقل)، ويُدعم `devicePixelRatio`
 * للحصول على رسم حادّ على شاشات Retina، مع تنظيف كامل عند إلغاء التركيب.
 */
import { useEffect, useMemo, useRef } from 'react';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';
import type { RecorderLevels } from '@/types';

export interface AudioVisualizerProps {
  levelsRef: React.RefObject<RecorderLevels>;
  active: boolean;
  /** 'bars' للترددات، 'wave' للموجة الزمنية، 'pulse' لحلقة نابضة */
  variant?: 'bars' | 'wave' | 'pulse';
  height?: number;
  className?: string;
  /** لون أساسي بصيغة CSS، الافتراضي indigo */
  accent?: string;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

const FALLBACK_ACCENT = '#6366f1';
const BAR_BUCKETS = 48;

/** يحوّل لون CSS (hex أو rgb/rgba) إلى مكوّنات RGB دون أي مكتبة خارجية. */
const parseColor = (value: string): Rgb => {
  const input = value.trim().toLowerCase();

  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(input);
  if (short) {
    return {
      r: parseInt(`${short[1]}${short[1]}`, 16),
      g: parseInt(`${short[2]}${short[2]}`, 16),
      b: parseInt(`${short[3]}${short[3]}`, 16),
    };
  }

  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(input);
  if (long) {
    return {
      r: parseInt(long[1] ?? '63', 16),
      g: parseInt(long[2] ?? '66', 16),
      b: parseInt(long[3] ?? 'f1', 16),
    };
  }

  const parts = input.match(/(\d+(?:\.\d+)?)/g);
  if (parts && parts.length >= 3) {
    return { r: Number(parts[0]), g: Number(parts[1]), b: Number(parts[2]) };
  }

  return { r: 99, g: 102, b: 241 };
};

/** استيفاء خطّي: يُنعّم الحركة عندما ينقطع الصوت فجأة. */
const approach = (current: number, target: number, factor: number): number =>
  current + (target - current) * Math.min(1, Math.max(0, factor));

const rgba = (rgb: Rgb, alpha: number): string =>
  `rgba(${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)}, ${alpha.toFixed(3)})`;

/** هل يمكن رسم مسار canvas فعلًا؟ (يُقيَّم مرة واحدة فقط). */
const detectCanvas = (): boolean => {
  if (typeof document === 'undefined' || typeof HTMLCanvasElement === 'undefined') return false;
  try {
    const probe = document.createElement('canvas');
    return Boolean(probe.getContext('2d'));
  } catch {
    return false;
  }
};

interface CanvasProps {
  levelsRef: React.RefObject<RecorderLevels>;
  active: boolean;
  variant: 'bars' | 'wave' | 'pulse';
  height: number;
  accent: string;
  reducedMotion: boolean;
  className?: string;
}

const CanvasVisualizer: React.FC<CanvasProps> = ({
  levelsRef,
  active,
  variant,
  height,
  accent,
  reducedMotion,
  className,
}) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const activeRef = useRef(active);
  const reducedRef = useRef(reducedMotion);
  const accentRef = useRef(accent);
  activeRef.current = active;
  reducedRef.current = reducedMotion;
  accentRef.current = accent;

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    let width = 1;
    let height = 1;
    let frame = 0;
    let smoothed = 0;

    let resize = (): void => {
      const rect = wrap.getBoundingClientRect();
      const ratio = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => resize());
    observer?.observe(wrap);
    resize();

    const drawBars = (bars: number[], intensity: number, rgb: Rgb): void => {
      const count = Math.max(12, Math.min(BAR_BUCKETS, bars.length > 0 ? bars.length : BAR_BUCKETS));
      const gap = width > 240 ? 3 : 2;
      const barWidth = Math.max(2, (width - gap * (count - 1)) / count);
      const minBar = Math.max(2, height * 0.06);
      const maxBar = Math.max(minBar + 1, height - 4);
      const isRtl = typeof document !== 'undefined' && document.dir === 'rtl';

      for (let index = 0; index < count; index += 1) {
        const raw = bars[index] ?? 0;
        const shaped = Math.pow(Math.max(0, Math.min(1, raw)), 0.8);
        const barHeight = Math.max(minBar, shaped * maxBar * Math.max(0.3, intensity + 0.25));
        // في RTL يُرسم العمود الأول من جهة اليمين ليتبع اتجاه القراءة.
        const x = isRtl ? width - (index + 1) * barWidth - index * gap : index * (barWidth + gap);
        const y = height - barHeight;

        const gradient = context.createLinearGradient(0, y, 0, height);
        gradient.addColorStop(0, rgba(rgb, 0.95));
        gradient.addColorStop(1, rgba(rgb, 0.22));
        context.fillStyle = gradient;
        context.beginPath();
        if (typeof context.roundRect === 'function') {
          context.roundRect(x, y, barWidth, barHeight, Math.min(barWidth / 2, 3));
        } else {
          context.rect(x, y, barWidth, barHeight);
        }
        context.fill();
      }
    };

    const drawWave = (bars: number[], intensity: number, rgb: Rgb): void => {
      const slice = Math.max(1, Math.floor((bars.length || BAR_BUCKETS) / Math.max(8, Math.floor(width))));
      const source = bars.length > 0 ? bars : new Array<number>(BAR_BUCKETS).fill(0);
      const points: number[] = [];
      for (let index = 0; index < source.length; index += slice) points.push(source[index] ?? 0);
      while (points.length < 4) points.push(0);

      const mid = height / 2;
      const amplitude = Math.max(1, mid - 3);
      const trace = (): void => {
        context.beginPath();
        for (let index = 0; index < points.length; index += 1) {
          const x = (index / (points.length - 1)) * width;
          const magnitude = Math.pow(points[index] ?? 0, 0.75) * amplitude * Math.max(0.25, intensity + 0.3);
          const y = mid + Math.sin(index * 0.72 + frame * 0.06) * magnitude;
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
      };

      context.lineJoin = 'round';
      context.lineCap = 'round';

      context.strokeStyle = rgba(rgb, 0.2);
      context.lineWidth = Math.min(12, height * 0.22);
      trace();
      context.stroke();

      const gradient = context.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, rgba(rgb, 0.5));
      gradient.addColorStop(0.5, rgba(rgb, 1));
      gradient.addColorStop(1, rgba(rgb, 0.5));
      context.strokeStyle = gradient;
      context.lineWidth = 2.5;
      trace();
      context.stroke();
    };

    const drawPulse = (level: number, speaking: boolean, rgb: Rgb): void => {
      const cx = width / 2;
      const cy = height / 2;
      const base = Math.min(width, height) / 2;
      const rings = reducedRef.current ? 1 : 3;

      for (let ring = 0; ring < rings; ring += 1) {
        const phase = reducedRef.current ? 0 : (frame * 0.012 + ring / rings) % 1;
        const radius = base * (0.34 + phase * 0.62 + level * 0.18);
        context.beginPath();
        context.arc(cx, cy, Math.max(1, radius), 0, Math.PI * 2);
        context.strokeStyle = rgba(rgb, Math.max(0, (1 - phase) * (0.4 + level * 0.5)));
        context.lineWidth = Math.max(1.5, base * 0.07 * (1 - phase * 0.5));
        context.stroke();
      }

      const core = context.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, base));
      core.addColorStop(0, rgba(rgb, 0.06 + level * 0.24));
      core.addColorStop(speaking ? 0.55 : 0.4, rgba(rgb, 0.03 + level * 0.12));
      core.addColorStop(1, 'rgba(0, 0, 0, 0)');
      context.fillStyle = core;
      context.beginPath();
      context.arc(cx, cy, Math.max(1, base), 0, Math.PI * 2);
      context.fill();
    };

    const tick = (): void => {
      frame += 1;
      const current = levelsRef.current;
      const bars = current.bars;
      const wanted = activeRef.current ? Math.max(0, Math.min(1, current.level)) : 0;
      smoothed = approach(smoothed, wanted, activeRef.current ? 0.45 : 0.09);

      // عند الخمول تبقى نبضة هادئة حتى لا تبدو اللوحة ميتة.
      const idle = reducedRef.current ? 0 : 0.05 + 0.035 * Math.sin(frame * 0.05);
      const intensity = activeRef.current ? Math.max(smoothed, current.speaking ? 0.28 : idle) : idle;

      context.clearRect(0, 0, width, height);
      if (variant === 'pulse') drawPulse(smoothed, current.speaking, accentRgb);
      else if (variant === 'wave') drawWave(bars, Math.max(smoothed, intensity), accentRgb);
      else drawBars(bars, Math.max(smoothed, intensity), accentRgb);

      if (activeRef.current && smoothed > 0.005 && !reducedRef.current) {
        context.fillStyle = rgba(accentRgb, smoothed * 0.05);
        context.fillRect(0, 0, width, height);
      }

      raf = window.requestAnimationFrame(tick);
    };

    let accentRgb = parseColor(accentRef.current || FALLBACK_ACCENT);
    let raf = window.requestAnimationFrame(tick);
    // يعيد قراءة اللون دوريًا فيلتقط تبديل الوضع الفاتح/الداكن دون إعادة تشغيل الحلقة.
    const accentWatch = window.setInterval(() => {
      accentRgb = parseColor(accentRef.current || FALLBACK_ACCENT);
    }, 800);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearInterval(accentWatch);
      observer?.disconnect();
    };
  }, [levelsRef, variant]);

  return (
    <div className={cn('relative w-full', className)} style={{ height }}>
      <div ref={wrapRef} className="absolute inset-0">
        <canvas ref={canvasRef} className="block h-full w-full" aria-hidden />
      </div>
    </div>
  );
};

/**
 * بديل SVG خفيف لحلقة `pulse` عندما يتعذّر الحصول على سياق الرسم (canvas).
 * يقرأ المستويات داخل حلقة RAF أيضًا ولا يُعيد الرندر لكل عيّنة.
 */
const PulseFallback: React.FC<{
  levelsRef: React.RefObject<RecorderLevels>;
  active: boolean;
  reducedMotion: boolean;
  className?: string;
}> = ({ levelsRef, active, reducedMotion, className }) => {
  const ref = useRef<SVGSVGElement | null>(null);
  const activeRef = useRef(active);
  const reducedRef = useRef(reducedMotion);
  activeRef.current = active;
  reducedRef.current = reducedMotion;

  useEffect(() => {
    let frame = 0;
    let smoothed = 0;
    const tick = (): void => {
      frame += 1;
      const target = activeRef.current ? levelsRef.current.level : 0;
      smoothed = approach(smoothed, target, activeRef.current ? 0.4 : 0.08);
      const scale = 1 + smoothed * (reducedRef.current ? 0.05 : 0.18);
      const opacity = reducedRef.current ? 0.5 : Math.max(0.15, 0.45 + smoothed * 0.5);
      const node = ref.current;
      if (node) {
        node.style.transform = `scale(${scale.toFixed(3)})`;
        node.style.opacity = opacity.toFixed(3);
      }
      raf = window.requestAnimationFrame(tick);
    };
    let raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [levelsRef]);

  return (
    <div className={cn('relative grid w-full place-items-center', className)} aria-hidden>
      <svg ref={ref} viewBox="0 0 100 100" className="size-full text-indigo-500">
        <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeOpacity="0.14" strokeWidth="1.6" />
        <circle
          cx="50"
          cy="50"
          r="30"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.4"
          strokeWidth="2"
          strokeDasharray="18 10"
        />
      </svg>
    </div>
  );
};

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  levelsRef,
  active,
  variant = 'bars',
  height = 64,
  className,
  accent = FALLBACK_ACCENT,
}) => {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const canvasAvailable = useMemo(detectCanvas, []);

  if (variant === 'pulse' && !canvasAvailable) {
    return (
      <PulseFallback
        levelsRef={levelsRef}
        active={active}
        reducedMotion={reducedMotion}
        className={className}
      />
    );
  }

  return (
    <CanvasVisualizer
      levelsRef={levelsRef}
      active={active}
      variant={variant}
      height={height}
      accent={accent}
      reducedMotion={reducedMotion}
      className={className}
    />
  );
};

export default AudioVisualizer;
