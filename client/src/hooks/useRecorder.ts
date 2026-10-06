/**
 * The audio engine: microphone capture, live visualiser data, voice-activity
 * detection and the three recording interactions required by the product spec.
 *
 *  - `toggle`     : click to start, click again to stop and translate.
 *  - `hold`       : press and hold to speak, release submits immediately.
 *  - `continuous` : long-running listener that slices speech into batches whenever
 *                   the speaker pauses for `silenceMs`, with a hard ceiling of
 *                   `maxSegmentMs` so live lectures never lose audio.
 *
 * Levels are exposed through a ref (not state) because the visualiser reads them
 * inside a requestAnimationFrame loop: no React re-render per audio frame.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AUDIO_MIME_CANDIDATES, MAX_SEGMENT_MS, MIN_SEGMENT_MS } from '../constants';
import type { AudioDeviceSummary, RecorderLevels } from '../types';
import { blobToBase64, pickSupportedMimeType, uid } from '../lib/utils';

export interface AudioBatch {
  id: string;
  base64: string;
  blob: Blob;
  mimeType: string;
  durationMs: number;
  /** Object URL for in-app replay; the caller owns revocation. */
  audioUrl: string;
  reason: 'manual' | 'silence' | 'max-duration' | 'stop';
}

export interface RecorderOptions {
  /** Milliseconds of continuous silence that closes a live segment. */
  silenceMs: number;
  /** 0..1 RMS threshold below which input counts as silence. */
  silenceThreshold: number;
  /** Minimum audio length worth sending to the model. */
  minSegmentMs: number;
  /** Hard ceiling for one live batch. */
  maxSegmentMs?: number;
  /** Continuous mode only: called for every finished batch. */
  onSegment?: (batch: AudioBatch) => void;
  /** Called when the user stops a non-continuous recording. */
  onFinalSegment?: (batch: AudioBatch) => void;
  /** Arabic error text (permission denied, unsupported browser, …). */
  onError?: (message: string) => void;
}

export interface RecorderApi {
  phase: 'idle' | 'recording' | 'processing';
  isRecording: boolean;
  isContinuous: boolean;
  elapsedMs: number;
  segmentElapsedMs: number;
  error: string | null;
  mimeType: string;
  supported: boolean;
  levelsRef: React.RefObject<RecorderLevels>;
  devices: AudioDeviceSummary[];
  selectedDeviceId: string;
  analyserRef: React.RefObject<AnalyserNode | null>;
  start: (mode: 'toggle' | 'hold' | 'continuous') => Promise<void>;
  stop: () => void;
  toggle: (mode: 'toggle' | 'hold' | 'continuous') => Promise<void>;
  pressStart: () => Promise<void>;
  pressEnd: () => void;
  cancel: () => void;
  clearError: () => void;
  selectDevice: (deviceId: string) => void;
  refreshDevices: () => Promise<void>;
}

type Mode = 'toggle' | 'hold' | 'continuous';

const IDLE_LEVELS = (): RecorderLevels => ({
  level: 0,
  bars: new Array<number>(48).fill(0),
  speaking: false,
  silenceMs: 0,
});

const mapMediaError = (error: unknown): string => {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    switch (error.name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return 'تم رفض الوصول إلى الميكروفون. اسمح بالوصول من إعدادات المتصفح ثم أعد المحاولة.';
      case 'NotFoundError':
      case 'OverconstrainedError':
        return 'لم يتم العثور على ميكروفون متصل. تحقق من الجهاز ثم أعد المحاولة.';
      case 'NotReadableError':
        return 'الميكروفون مشغول بتطبيق آخر. أغلق التطبيق الآخر ثم أعد المحاولة.';
      default:
        return `تعذّر تشغيل الميكروفون (${error.name}).`;
    }
  }
  return 'تعذّر تشغيل الميكروفون. تحقق من الصلاحيات ثم أعد المحاولة.';
};

export function useRecorder(options: RecorderOptions): RecorderApi {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [phase, setPhase] = useState<RecorderApi['phase']>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [segmentElapsedMs, setSegmentElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<AudioDeviceSummary[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');

  const levelsRef = useRef<RecorderLevels>(IDLE_LEVELS());
  const analyserRef = useRef<AnalyserNode | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const timeDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const freqDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  const chunksRef = useRef<Blob[]>([]);
  const batchStartRef = useRef(0);
  /** Offset added to the live timer so it restarts cleanly on each session. */
  const elapsedBaseRef = useRef(0);
  const silenceAccRef = useRef(0);
  const lastTickRef = useRef(0);
  /** Last time the throttled segment timer was published to React state. */
  const lastSegmentPushRef = useRef(0);
  const speakingRef = useRef(false);
  const stoppingRef = useRef(false);
  const modeRef = useRef<Mode>('toggle');
  const phaseRef = useRef<RecorderApi['phase']>('idle');
  phaseRef.current = phase;

  const supported = useMemo(
    () =>
      typeof navigator !== 'undefined' &&
      typeof MediaRecorder !== 'undefined' &&
      Boolean(navigator.mediaDevices?.getUserMedia),
    [],
  );

  const mimeType = useMemo(() => pickSupportedMimeType(AUDIO_MIME_CANDIDATES), []);

  const teardownAudioGraph = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    analyserRef.current = null;
    levelsRef.current = IDLE_LEVELS();
    const context = contextRef.current;
    contextRef.current = null;
    if (context && context.state !== 'closed') {
      void context.close().catch(() => undefined);
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const refreshDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const list = await navigator.mediaDevices.enumerateDevices();
      const inputs = list
        .filter((device) => device.kind === 'audioinput')
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `ميكروفون ${index + 1}`,
        }));
      setDevices(inputs);
      setSelectedDeviceId((current) =>
        current && inputs.some((device) => device.deviceId === current) ? current : inputs[0]?.deviceId ?? '',
      );
    } catch {
      /* enumeration is best-effort */
    }
  }, []);

  useEffect(() => {
    void refreshDevices();
    const media = navigator.mediaDevices;
    if (!media?.addEventListener) return;
    const handler = (): void => void refreshDevices();
    media.addEventListener('devicechange', handler);
    return () => media.removeEventListener('devicechange', handler);
  }, [refreshDevices]);

  /**
   * Emits the audio collected so far. `isFinal` routes the batch to
   * `onFinalSegment` (single-shot modes) instead of `onSegment` (live feed).
   */
  const emitBatch = useCallback(
    (reason: AudioBatch['reason'], isFinal: boolean) => {
      const chunks = chunksRef.current;
      chunksRef.current = [];
      const durationMs = Math.max(0, performance.now() - batchStartRef.current);
      batchStartRef.current = performance.now();
      silenceAccRef.current = 0;
      setSegmentElapsedMs(0);

      if (chunks.length === 0) return;

      const type = recorderRef.current?.mimeType || mimeType || 'audio/webm';
      const blob = new Blob(chunks, { type });
      const minMs = optionsRef.current.minSegmentMs || MIN_SEGMENT_MS;
      // Too short to be speech — continuous mode produces these constantly.
      if (blob.size < 1200 || durationMs < minMs) return;

      void blobToBase64(blob)
        .then((base64) => {
          const batch: AudioBatch = {
            id: uid('audio'),
            base64,
            blob,
            mimeType: type.split(';')[0] ?? 'audio/webm',
            durationMs,
            audioUrl: URL.createObjectURL(blob),
            reason,
          };
          if (isFinal) optionsRef.current.onFinalSegment?.(batch);
          else optionsRef.current.onSegment?.(batch);
        })
        .catch(() => {
          optionsRef.current.onError?.('تعذّر تجهيز بيانات الصوت المسجّل. أعد المحاولة.');
        });
    },
    [mimeType],
  );

  const buildAudioGraph = useCallback((stream: MediaStream) => {
    const AudioContextCtor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const context = new AudioContextCtor();
    contextRef.current = context;
    void context.resume().catch(() => undefined);
    const source = context.createMediaStreamSource(stream);
    sourceRef.current = source;
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.72;
    source.connect(analyser);
    analyserRef.current = analyser;
    timeDataRef.current = new Uint8Array(new ArrayBuffer(analyser.fftSize));
    freqDataRef.current = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
  }, []);

  const startLevelLoop = useCallback(() => {
    lastTickRef.current = performance.now();

    const tick = (): void => {
      const analyser = analyserRef.current;
      const timeData = timeDataRef.current;
      const freqData = freqDataRef.current;
      const now = performance.now();
      const delta = Math.min(120, Math.max(8, now - lastTickRef.current));
      lastTickRef.current = now;

      if (!analyser || !timeData || !freqData) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      analyser.getByteTimeDomainData(timeData);
      let sum = 0;
      for (let i = 0; i < timeData.length; i += 1) {
        const value = ((timeData[i] ?? 128) - 128) / 128;
        sum += value * value;
      }
      const rms = Math.sqrt(sum / timeData.length);
      const level = Math.min(1, rms * 3.4);

      analyser.getByteFrequencyData(freqData);
      const bucketCount = 48;
      const bucketSize = Math.max(1, Math.floor(freqData.length / bucketCount));
      const bars: number[] = new Array(bucketCount);
      for (let b = 0; b < bucketCount; b += 1) {
        let peak = 0;
        for (let i = 0; i < bucketSize; i += 1) {
          peak = Math.max(peak, freqData[b * bucketSize + i] ?? 0);
        }
        bars[b] = Math.min(1, (peak / 255) * 1.35);
      }

      const threshold = optionsRef.current.silenceThreshold;
      const speaking = rms >= threshold;

      if (speaking) {
        silenceAccRef.current = 0;
      } else if (modeRef.current === 'continuous') {
        silenceAccRef.current += delta;
      }

      const silenceMs = silenceAccRef.current;
      levelsRef.current = { level, bars, speaking, silenceMs };

      const segmentMs = now - batchStartRef.current;
      const ceiling = optionsRef.current.maxSegmentMs ?? MAX_SEGMENT_MS;

      if (modeRef.current === 'continuous') {
        const paused = speakingRef.current && !speaking && silenceMs >= optionsRef.current.silenceMs;
        const overCeiling = segmentMs >= ceiling && (speaking || silenceMs > 0);
        if (paused || overCeiling) emitBatch(paused ? 'silence' : 'max-duration', false);
      }

      speakingRef.current = speaking;

      // Throttled read-out: the timer only needs ~5 updates/second, and the
      // canvas visualiser reads `levelsRef` directly at animation speed.
      if (now - lastSegmentPushRef.current >= 200) {
        lastSegmentPushRef.current = now;
        setSegmentElapsedMs(segmentMs);
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [emitBatch]);

  const start = useCallback(
    async (mode: Mode) => {
      if (phaseRef.current !== 'idle') return;
      if (!supported) {
        const message = 'متصفحك لا يدعم تسجيل الصوت (MediaRecorder). جرّب Chrome أو Edge أو Safari حديثًا.';
        setError(message);
        optionsRef.current.onError?.(message);
        return;
      }

      setError(null);
      modeRef.current = mode;
      batchStartRef.current = performance.now();
      elapsedBaseRef.current = 0;
      silenceAccRef.current = 0;
      speakingRef.current = false;
      chunksRef.current = [];
      setPhase('recording');
      phaseRef.current = 'recording';

      try {
        const constraints: MediaStreamConstraints = {
          audio: {
            ...(selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : {}),
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          },
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;
        void refreshDevices();

        buildAudioGraph(stream);

        const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 96_000 } : undefined);
        recorderRef.current = recorder;

        recorder.ondataavailable = (event: BlobEvent) => {
          if (event.data.size > 0) chunksRef.current.push(event.data);
        };
        recorder.onerror = () => {
          const message = 'توقف التسجيل بسبب خطأ في الميكروفون. أعد المحاولة.';
          setError(message);
          optionsRef.current.onError?.(message);
        };
        recorder.onstop = () => {
          // Final flush lives here so the last chunk is never lost.
          if (stoppingRef.current) {
            stoppingRef.current = false;
            emitBatch('stop', true);
          }
        };

        // A 1s timeslice keeps chunks flowing for multi-minute live sessions.
        recorder.start(1000);
        setElapsedMs(0);
        setSegmentElapsedMs(0);
        startLevelLoop();
      } catch (caught) {
        teardownAudioGraph();
        const message = mapMediaError(caught);
        setError(message);
        setPhase('idle');
        phaseRef.current = 'idle';
        optionsRef.current.onError?.(message);
      }
    },
    [buildAudioGraph, emitBatch, mimeType, refreshDevices, selectedDeviceId, startLevelLoop, supported, teardownAudioGraph],
  );

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      teardownAudioGraph();
      setPhase('idle');
      phaseRef.current = 'idle';
      return;
    }
    stoppingRef.current = true;
    setPhase('processing');
    phaseRef.current = 'processing';
    try {
      recorder.requestData();
    } catch {
      /* requestData is optional */
    }
    recorder.stop();
    // Let the final dataavailable/onstop pair run, then release the microphone.
    setTimeout(() => {
      teardownAudioGraph();
      recorderRef.current = null;
      setPhase('idle');
      phaseRef.current = 'idle';
      setElapsedMs((current) => {
        elapsedBaseRef.current = current;
        return current;
      });
    }, 220);
  }, [teardownAudioGraph]);

  const cancel = useCallback(() => {
    chunksRef.current = [];
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
    }
    recorderRef.current = null;
    stoppingRef.current = false;
    teardownAudioGraph();
    setPhase('idle');
    phaseRef.current = 'idle';
    setElapsedMs(0);
    setSegmentElapsedMs(0);
  }, [teardownAudioGraph]);

  const toggle = useCallback(
    async (mode: Mode) => {
      if (phaseRef.current === 'recording') stop();
      else if (phaseRef.current === 'idle') await start(mode);
    },
    [start, stop],
  );

  const pressStart = useCallback(async () => {
    if (phaseRef.current === 'idle') await start('hold');
  }, [start]);

  const pressEnd = useCallback(() => {
    if (phaseRef.current === 'recording' && modeRef.current === 'hold') stop();
  }, [stop]);

  /** Elapsed read-out for the recorder card. */
  useEffect(() => {
    if (phase !== 'recording') return;
    const reference = performance.now();
    const base = elapsedBaseRef.current;
    const interval = setInterval(() => setElapsedMs(base + (performance.now() - reference)), 200);
    return () => clearInterval(interval);
  }, [phase]);

  // Non-continuous recordings must not keep the microphone hot in the background.
  useEffect(() => {
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden' && phaseRef.current === 'recording' && modeRef.current !== 'continuous') {
        stop();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [stop]);

  useEffect(
    () => () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        try {
          recorder.stop();
        } catch {
          /* ignore */
        }
      }
      teardownAudioGraph();
    },
    [teardownAudioGraph],
  );

  return {
    phase,
    isRecording: phase === 'recording',
    isContinuous: modeRef.current === 'continuous',
    elapsedMs,
    segmentElapsedMs,
    error,
    mimeType,
    supported,
    levelsRef,
    devices,
    selectedDeviceId,
    analyserRef,
    start,
    stop,
    toggle,
    pressStart,
    pressEnd,
    cancel,
    clearError: () => setError(null),
    selectDevice: setSelectedDeviceId,
    refreshDevices,
  };
}
