/**
 * Application orchestrator: owns every piece of session state, wires the audio
 * engine to the Gemini endpoints, and persists settings/history/glossary.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AudioLines, History, Keyboard, Languages, Mic, Radio } from 'lucide-react';

import AppHeader from './components/AppHeader';
import TranslationToolbar from './components/TranslationToolbar';
import TextComposer from './components/TextComposer';
import RecorderCard from './components/RecorderCard';
import ResultPanel from './components/results/ResultPanel';
import LiveFeed from './components/results/LiveFeed';
import HistoryDrawer from './components/HistoryDrawer';
import SettingsModal from './components/SettingsModal';
import InstallGuide from './components/InstallGuide';
import GlossaryPanel from './components/GlossaryPanel';
import ApiKeyGate from './components/ApiKeyGate';
import ToastStack from './components/ui/ToastStack';

import { DEFAULT_SETTINGS, RECORDER_MODE_LABELS, findLanguage } from './constants';
import { fetchStatus, translateAudio, translateText, validateApiKey, TranslationApiError } from './lib/api';
import {
  buildExportBundle,
  buildPlainTextExport,
  clearAllStoredData,
  loadGlossary,
  loadHistory,
  loadSettings,
  mergeGlossaryEntries,
  saveGlossary,
  saveHistory,
  saveSettings,
  toHistoryItem,
} from './lib/storage';
import { copyToClipboard, downloadFile, truncate, uid, wordCount } from './lib/utils';
import { useRecorder, type AudioBatch } from './hooks/useRecorder';
import { useSpeech } from './hooks/useSpeech';
import { useToasts } from './hooks/useToasts';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { clearStoredApiKey, loadStoredApiKey, saveStoredApiKey } from './lib/keyStore';

import type { AuthMode } from '@shared/api-contract';
import type {
  AppSettings,
  GlossaryEntry,
  HistoryItem,
  KeyTerm,
  LiveSegment,
  PresetId,
  RecorderMode,
  ThemeMode,
  ToneId,
  TranslationResult,
} from './types';

const MAX_HINTS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const AUDIO_RETENTION_MS = DAY_MS;

const pickRecorderMode = (settings: AppSettings): RecorderMode => settings.defaultRecorderMode;

const applyTheme = (theme: ThemeMode): void => {
  const root = document.documentElement;
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  const dark = theme === 'dark' || (theme === 'system' && prefersDark);
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
};

export default function App(): React.JSX.Element {
  /* ------------------------------------------------------------ settings */

  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const patchSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((current) => {
      const next: AppSettings = { ...current, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const online = useOnlineStatus();
  const toasts = useToasts();

  /* --------------------------------------------------- server capabilities */

  /**
   * Declared before the key store because saving a key needs `serverReachable` to
   * distinguish "invalid key" from "offline".
   */
  const [serverReachable, setServerReachable] = useState<boolean | null>(null);
  const [serverKeyConfigured, setServerKeyConfigured] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('user');
  const [activeModel, setActiveModel] = useState<string | undefined>(undefined);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const ping = async (): Promise<void> => {
      try {
        const status = await fetchStatus(controller.signal);
        if (cancelled) return;
        setServerReachable(true);
        setServerKeyConfigured(status.serverKeyConfigured);
        setAuthMode(status.authMode);
        setStatusError(null);
      } catch (error) {
        if (cancelled) return;
        setServerReachable(false);
        setStatusError(error instanceof Error ? error.message : 'تعذّر الوصول إلى الخادم.');
      }
    };

    void ping();
    const interval = setInterval(() => void ping(), 60_000);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(interval);
    };
  }, [online]);

  /* --------------------------------------------------- user API key store */

  /**
   * The key is the user's own; the server never provides one. It is hydrated
   * asynchronously because it lives AES-GCM encrypted in `lib/keyStore.ts`.
   */
  const [keyHydrated, setKeyHydrated] = useState(false);
  const [hasPersistedKey, setHasPersistedKey] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await loadStoredApiKey();
      if (cancelled) return;
      if (stored) {
        setSettings((current) => ({ ...current, userApiKey: stored }));
        setHasPersistedKey(true);
        // A stored key that no longer works should not hide the gate silently.
      } else {
        setHasPersistedKey(false);
        setGateOpen(true);
      }
      setKeyHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Saves the key (encrypted) and validates it against Google. */
  const saveUserKey = useCallback(
    async (apiKey: string, remember: boolean): Promise<{ valid: boolean; reason?: string }> => {
      const trimmed = apiKey.trim();
      setSavingKey(true);
      try {
        setSettings((current) => ({ ...current, userApiKey: trimmed }));

        let validation: { valid: boolean; reason?: string };
        try {
          const response = await validateApiKey(trimmed);
          validation = { valid: response.valid, ...(response.reason ? { reason: response.reason } : {}) };
        } catch (error) {
          // Cannot reach the server: keep the key and let the first translation decide.
          validation = {
            valid: false,
            reason: error instanceof Error ? error.message : 'تعذّر التحقق من المفتاح الآن.',
          };
        }

        if (remember && (validation.valid || serverReachable === false)) {
          const stored = await saveStoredApiKey(trimmed);
          if (!stored) {
            toasts.warning('لم يُحفظ المفتاح', 'المتصفح منع التخزين المحلي (وضع خاص؟) — سيبقى في هذه الجلسة فقط.');
          }
          setHasPersistedKey(stored);
        }

        if (validation.valid) {
          setGateOpen(false);
          toasts.success('تم تفعيل مفتاحك', 'صار بإمكانك الترجمة بالصوت والنص.');
        }
        return validation;
      } finally {
        setSavingKey(false);
      }
    },
    [serverReachable, toasts],
  );

  const forgetUserKey = useCallback(() => {
    clearStoredApiKey();
    setHasPersistedKey(false);
    setSettings((current) => ({ ...current, userApiKey: '' }));
    setGateOpen(true);
    toasts.info('تم حذف المفتاح', 'أُزيل المفتاح من هذا الجهاز.');
  }, [toasts]);

  /** فعّل البوابة تلقائيًا كلما استُخدم التطبيق بلا مفتاح. */
  useEffect(() => {
    if (!keyHydrated) return;
    if (settings.userApiKey.trim().length === 0) setGateOpen(true);
  }, [keyHydrated, settings.userApiKey]);

  /* --------------------------------------------------------------- theme */

  useEffect(() => {
    applyTheme(settings.theme);
    if (settings.theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (): void => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [settings.theme]);

  /* ---------------------------------------------------------- direction */

  useEffect(() => {
    const root = document.documentElement;
    root.lang = settings.locale;
    root.dir = settings.locale === 'ar' ? 'rtl' : 'ltr';
  }, [settings.locale]);

  /* ------------------------------------------------------- server status */

  /* ------------------------------------------------------------ history */

  const [history, setHistory] = useState<HistoryItem[]>(() => {
    const items = loadHistory();
    const cutoff = Date.now() - 90 * DAY_MS;
    return items.filter((item) => item.createdAt >= cutoff);
  });
  const [glossary, setGlossary] = useState<GlossaryEntry[]>(() => loadGlossary());

  const archiveResult = useCallback(
    (result: TranslationResult) => {
      const item = toHistoryItem(result);
      const limit = settingsRef.current.historyLimit;
      setHistory((current) => {
        const next = [item, ...current].slice(0, limit);
        saveHistory(next);
        return next;
      });
      setGlossary((current) => {
        const next = mergeGlossaryEntries(current, result.keyTerms, {
          sourceLang: result.sourceLang,
          targetLang: result.targetLang,
          preset: result.preset,
          timestamp: result.createdAt,
        });
        saveGlossary(next);
        return next;
      });
    },
    [],
  );

  /* -------------------------------------------------- session selections */

  const [sourceLang, setSourceLang] = useState(settings.defaultSourceLang);
  const [targetLang, setTargetLang] = useState(settings.defaultTargetLang);
  const [preset, setPreset] = useState<PresetId>(settings.defaultPreset);
  const [tone, setTone] = useState<ToneId>(settings.defaultTone);
  const [customContext, setCustomContext] = useState('');
  const [inputMode, setInputMode] = useState<'text' | 'audio'>('audio');
  const [recorderMode, setRecorderMode] = useState<RecorderMode>(() => pickRecorderMode(settings));

  const [text, setText] = useState('');
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [textProcessing, setTextProcessing] = useState(false);
  const [liveSegments, setLiveSegments] = useState<LiveSegment[]>([]);
  const [liveView, setLiveView] = useState(false);
  const [detectedLanguage, setDetectedLanguage] = useState<string | undefined>(undefined);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const audioUrlsRef = useRef<string[]>([]);
  const registerAudioUrl = useCallback((url: string) => {
    audioUrlsRef.current.push(url);
  }, []);

  useEffect(
    () => () => {
      audioUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      audioUrlsRef.current = [];
    },
    [],
  );

  /* -------------------------------------------------------------- speech */

  const speech = useSpeech({
    rate: settings.speechRate,
    volume: settings.speechVolume,
    preferredVoiceUri: settings.speechVoiceUri,
  });

  const speak = useCallback(
    (textToSpeak: string, languageCode: string, id: string) => {
      if (!speech.supported) {
        toasts.warning('النطق غير مدعوم', 'متصفحك لا يوفر خاصية تحويل النص إلى كلام.');
        return;
      }
      setSpeakingId(id);
      speech.speak(textToSpeak, findLanguage(languageCode), id);
    },
    [speech, toasts],
  );

  useEffect(() => {
    if (speech.speakingId === null) setSpeakingId(null);
  }, [speech.speakingId]);

  /* --------------------------------------------------- translation core */

  const conversationHints = useCallback((): string[] => {
    const source = history
      .filter((item) => item.kind === 'audio')
      .slice(0, MAX_HINTS)
      .map((item) => `${truncate(item.transcription || item.sourceText, 140)} → ${truncate(item.translation, 140)}`);
    return source;
  }, [history]);

  const requestPayload = useCallback(() => {
    const key = settingsRef.current.userApiKey.trim();
    return {
      sourceLang,
      targetLang,
      preset,
      tone,
      ...(customContext.trim() ? { customContext: customContext.trim() } : {}),
      conversationHints: conversationHints(),
      ...(key ? { apiKey: key } : {}),
    };
  }, [conversationHints, customContext, preset, sourceLang, targetLang, tone]);

  const describeError = useCallback(
    (error: unknown): string => {
      if (error instanceof TranslationApiError) return error.message;
      if (error instanceof Error && error.message) return error.message;
      return 'حدث خطأ غير متوقع أثناء الترجمة.';
    },
    [],
  );

  /** Exposes the original recording to both transcript and translation cards. */
  const linkedAudio = useCallback(
    (audioUrl?: string): { audioUrl?: string; sourceAudioUrl?: string } =>
      audioUrl ? { audioUrl, sourceAudioUrl: audioUrl } : {},
    [],
  );

  const buildResult = useCallback(
    (
      kind: 'text' | 'audio',
      sourceText: string,
      data: {
        transcription: string;
        translation: string;
        detectedLanguage: string;
        contextAnalysis: string;
        keyTerms: KeyTerm[];
        durationMs?: number | null;
        keyWarning?: string;
      },
      meta: { model: string; attempts: number; latencyMs: number; keySource: 'user' | 'server' },
      extras: { audioUrl?: string; audioMimeType?: string },
    ): TranslationResult => ({
      id: uid('res'),
      kind,
      sourceText,
      transcription: data.transcription,
      translation: data.translation,
      detectedLanguage: data.detectedLanguage,
      contextAnalysis: data.contextAnalysis,
      keyTerms: data.keyTerms,
      sourceLang,
      targetLang,
      preset,
      tone,
      ...(customContext.trim() ? { customContext: customContext.trim() } : {}),
      model: meta.model,
      attempts: meta.attempts,
      latencyMs: meta.latencyMs,
      keySource: meta.keySource,
      ...(data.keyWarning ? { keyWarning: data.keyWarning } : {}),
      createdAt: Date.now(),
      ...(data.durationMs ? { durationMs: data.durationMs } : {}),
      ...(extras.audioUrl ? { audioMimeType: extras.audioMimeType ?? 'audio/webm' } : {}),
      ...linkedAudio(extras.audioUrl),
    }),
    [customContext, linkedAudio, preset, sourceLang, targetLang, tone],
  );

  const [retryPayload, setRetryPayload] = useState<{ kind: 'text' | 'audio'; text?: string; batch?: AudioBatch } | null>(
    null,
  );

  const submitAudio = useCallback(
    async (batch: AudioBatch | { base64: string; mimeType: string; durationMs: number; audioUrl: string; blob?: Blob }) => {
      const isLive = recorderMode === 'continuous';
      const segmentId = uid('seg');
      const startedAt = Date.now();

      if (isLive) {
        setLiveView(true);
        setLiveSegments((current) => [
          {
            id: segmentId,
            index: current.length + 1,
            status: 'processing',
            durationMs: batch.durationMs,
            createdAt: startedAt,
            transcription: '',
            translation: '',
            detectedLanguage: '',
            contextAnalysis: '',
            keyTerms: [],
            audioUrl: batch.audioUrl,
            audioMimeType: batch.mimeType,
            audioBase64: batch.base64,
          },
          ...current,
        ]);
      } else {
        setProcessing(true);
      }

      try {
        const { data, meta } = await translateAudio({
          ...requestPayload(),
          audioBase64: batch.base64,
          mimeType: batch.mimeType,
          ...(batch.durationMs ? { durationMs: batch.durationMs } : {}),
        });

        setActiveModel(meta.model);
        if (data.keyWarning) toasts.warning('تنبيه بشأن المفتاح', data.keyWarning);

        const built = buildResult('audio', data.transcription, data, meta, {
          audioUrl: batch.audioUrl,
          audioMimeType: batch.mimeType,
        });

        if (isLive) {
          setLiveSegments((current) =>
            current.map((segment) =>
              segment.id === segmentId
                ? {
                    ...segment,
                    status: 'completed',
                    transcription: data.transcription,
                    translation: data.translation,
                    detectedLanguage: data.detectedLanguage,
                    contextAnalysis: data.contextAnalysis,
                    keyTerms: data.keyTerms,
                    model: meta.model,
                    latencyMs: meta.latencyMs,
                  }
                : segment,
            ),
          );
          archiveResult({ ...built, createdAt: startedAt });
        } else {
          setResult(built);
          setDetectedLanguage(data.detectedLanguage);
          archiveResult(built);
          if (settingsRef.current.autoSpeak && data.translation) speak(data.translation, targetLang, 'target');
        }
      } catch (error) {
        const message = describeError(error);
        if (isLive) {
          setLiveSegments((current) =>
            current.map((segment) =>
              segment.id === segmentId ? { ...segment, status: 'error', error: message } : segment,
            ),
          );
        } else {
          setRetryPayload({ kind: 'audio', batch: batch as AudioBatch });
          toasts.error('فشلت ترجمة الصوت', message);
        }
      } finally {
        if (!isLive) setProcessing(false);
      }
    },
    [archiveResult, buildResult, describeError, recorderMode, requestPayload, speak, targetLang, toasts],
  );

  const handleAudioBatch = useCallback(
    (batch: AudioBatch) => {
      registerAudioUrl(batch.audioUrl);
      void submitAudio(batch);
    },
    [registerAudioUrl, submitAudio],
  );

  const recorder = useRecorder({
    silenceMs: settings.vadSilenceMs,
    silenceThreshold: settings.vadThreshold,
    minSegmentMs: settings.minSegmentMs,
    onSegment: handleAudioBatch,
    onFinalSegment: handleAudioBatch,
    onError: (message) => toasts.error('خطأ في التسجيل', message),
  });

  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;

  const submitText = useCallback(
    async (override?: string) => {
      const body = (override ?? text).trim();
      if (!body) {
        toasts.warning('لا يوجد نص', 'اكتب أو الصق نصًا لترجمته.');
        return;
      }
      setTextProcessing(true);
      try {
        const { data, meta } = await translateText({ ...requestPayload(), text: body });
        setActiveModel(meta.model);
        if (data.keyWarning) toasts.warning('تنبيه بشأن المفتاح', data.keyWarning);

        const built = buildResult('text', body, data, meta, {});
        setResult(built);
        setDetectedLanguage(data.detectedLanguage);
        archiveResult(built);
        if (settingsRef.current.autoSpeak && data.translation) speak(data.translation, targetLang, 'target');
        setRetryPayload(null);
      } catch (error) {
        const message = describeError(error);
        setRetryPayload({ kind: 'text', text: body });
        toasts.error('فشلت الترجمة النصية', message);
      } finally {
        setTextProcessing(false);
      }
    },
    [archiveResult, buildResult, describeError, requestPayload, speak, targetLang, text, toasts],
  );

  const retryLast = useCallback(() => {
    if (!retryPayload) return;
    if (retryPayload.kind === 'text' && retryPayload.text) void submitText(retryPayload.text);
    else if (retryPayload.batch) void submitAudio(retryPayload.batch);
  }, [retryPayload, submitAudio, submitText]);

  /* ----------------------------------------------------------- commands */

  const handleToggleRecording = useCallback(() => {
    setInputMode('audio');
    if (recorderMode === 'continuous') setLiveView(true);
    void recorderRef.current.toggle(recorderMode);
  }, [recorderMode]);

  const handlePressStart = useCallback(async () => {
    setInputMode('audio');
    await recorderRef.current.pressStart();
  }, []);

  const handlePressEnd = useCallback(() => {
    recorderRef.current.pressEnd();
  }, []);

  const handleCancelRecording = useCallback(() => {
    recorderRef.current.cancel();
    toasts.info('أُلغي التسجيل', 'لم يتم إرسال أي صوت إلى الموديل.');
  }, [toasts]);

  const handleCopy = useCallback(
    async (value: string, label: string) => {
      const copied = await copyToClipboard(value);
      if (copied) toasts.success('تم النسخ', label);
      else toasts.error('تعذّر النسخ', 'المتصفح منع الوصول إلى الحافظة.');
    },
    [toasts],
  );

  const handleShare = useCallback(
    async (value: string) => {
      if (typeof navigator !== 'undefined' && 'share' in navigator) {
        try {
          await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({
            title: 'المترجم الصوتي والسياقي الذكي',
            text: value,
          });
          return;
        } catch {
          /* user cancelled or unsupported: fall back to the clipboard */
        }
      }
      await handleCopy(value, 'تم نسخ النص لمشاركته.');
    },
    [handleCopy],
  );

  const toggleFavorite = useCallback((id: string) => {
    setHistory((current) => {
      const next = current.map((item) => (item.id === id ? { ...item, favorite: !item.favorite } : item));
      saveHistory(next);
      return next;
    });
  }, []);

  const deleteHistoryItem = useCallback(
    (id: string) => {
      setHistory((current) => {
        const next = current.filter((item) => item.id !== id);
        saveHistory(next);
        return next;
      });
      toasts.info('تم حذف العنصر', 'أُزيل من السجل المحلي.');
    },
    [toasts],
  );

  const clearHistory = useCallback(() => {
    if (settingsRef.current.confirmDestructive && !window.confirm('سيتم حذف كل سجل الترجمات نهائيًا. هل تريد المتابعة؟')) {
      return;
    }
    setHistory([]);
    saveHistory([]);
    toasts.success('تم مسح السجل', 'لم يتبقَّ أي عنصر محفوظ.');
  }, [toasts]);

  const clearGlossary = useCallback(() => {
    if (settingsRef.current.confirmDestructive && !window.confirm('سيتم حذف كل مصطلحات المسرد. هل تريد المتابعة؟')) return;
    setGlossary([]);
    saveGlossary([]);
    toasts.success('تم مسح المسرد', 'أُزيلت كل المصطلحات المحفوظة.');
  }, [toasts]);

  const deleteGlossaryEntry = useCallback(
    (id: string) => {
      setGlossary((current) => {
        const next = current.filter((entry) => entry.id !== id);
        saveGlossary(next);
        return next;
      });
    },
    [],
  );

  /* --------------------------------------------------------- live feed ops */

  const replaySegment = useCallback((segment: LiveSegment) => {
    if (!segment.audioUrl) return;
    const audio = new Audio(segment.audioUrl);
    void audio.play().catch(() => undefined);
  }, []);

  const retrySegment = useCallback(
    (segment: LiveSegment) => {
      if (!segment.audioBase64) return;
      void submitAudio({
        base64: segment.audioBase64,
        mimeType: segment.audioMimeType ?? 'audio/webm',
        durationMs: segment.durationMs,
        audioUrl: segment.audioUrl ?? '',
      });
    },
    [submitAudio],
  );

  const clearLiveFeed = useCallback(() => {
    setLiveSegments([]);
    toasts.info('تم مسح البث', 'استُبعدت كل المقاطع من العرض الحالي.');
  }, [toasts]);

  /* ------------------------------------------------------------- exports */

  const exportJson = useCallback(() => {
    if (history.length === 0) {
      toasts.warning('السجل فارغ', 'لا يوجد ما يمكن تصديره.');
      return;
    }
    downloadFile(`translations-${Date.now()}.json`, JSON.stringify(buildExportBundle(history), null, 2));
    toasts.success('تم التصدير', 'نُزّل ملف JSON بكل السجل.');
  }, [history, toasts]);

  const exportText = useCallback(() => {
    if (history.length === 0) {
      toasts.warning('السجل فارغ', 'لا يوجد ما يمكن تصديره.');
      return;
    }
    downloadFile(`translations-${Date.now()}.txt`, buildPlainTextExport(history), 'text/plain');
    toasts.success('تم التصدير', 'نُزّل ملف نصي بكل السجل.');
  }, [history, toasts]);

  /* --------------------------------------------------------- maintenance */

  useEffect(() => {
    // Audio object URLs are memory-only: drop the references after a day.
    const cutoff = Date.now() - AUDIO_RETENTION_MS;
    audioUrlsRef.current = audioUrlsRef.current.filter(() => Date.now() > cutoff);
  }, []);

  /* --------------------------------------------------------------- render */

  const targetLabel = findLanguage(targetLang)?.nativeLabel ?? targetLang;
  const sourceLabel = findLanguage(sourceLang)?.nativeLabel ?? sourceLang;
  const stats = useMemo(
    () => ({
      segments: liveSegments.length,
      words: history.reduce((total, item) => total + wordCount(item.translation), 0),
      terms: glossary.length,
    }),
    [glossary.length, history, liveSegments.length],
  );

  /**
   * يُستخدم من الإعدادات: يتحقق من المفتاح، وإذا نجح يُثبّته في الجلسة ويحفظه
   * مشفّرًا (لأن الإعدادات تعني أن المستخدم يريد استخدامه فعلًا).
   */
  const handleValidateKey = useCallback(
    async (apiKey: string): Promise<{ valid: boolean; reason?: string }> => {
      // `env` لفحص مفتاح الخادم في الوضع المختلط فقط.
      if (apiKey === 'env') {
        try {
          const response = await validateApiKey('env');
          return { valid: response.valid, ...(response.reason ? { reason: response.reason } : {}) };
        } catch (error) {
          return { valid: false, reason: describeError(error) };
        }
      }

      const result = await saveUserKey(apiKey, true);
      if (result.valid) toasts.success('تم تفعيل المفتاح وحفظه', 'المفتاح مشفّر على هذا الجهاز.');
      return result;
    },
    [describeError, saveUserKey, toasts],
  );

  const handleTestVoice = useCallback(
    (languageCode: string) => {
      speech.test(findLanguage(languageCode));
    },
    [speech],
  );

  const handleSelectHistory = useCallback((item: HistoryItem) => {
    setResult({
      id: item.id,
      kind: item.kind,
      sourceText: item.sourceText,
      transcription: item.transcription,
      translation: item.translation,
      detectedLanguage: item.detectedLanguage,
      contextAnalysis: item.contextAnalysis,
      keyTerms: item.keyTerms,
      sourceLang: item.sourceLang,
      targetLang: item.targetLang,
      preset: item.preset,
      tone: item.tone,
      ...(item.customContext ? { customContext: item.customContext } : {}),
      model: item.model,
      attempts: 1,
      latencyMs: item.latencyMs,
      keySource: settingsRef.current.userApiKey ? 'user' : 'server',      createdAt: item.createdAt,
      ...(item.durationMs ? { durationMs: item.durationMs } : {}),
    });
    setSourceLang(item.sourceLang);
    setTargetLang(item.targetLang);
    setPreset(item.preset);
    setTone(item.tone);
    setDrawerOpen(false);
  }, []);

  const resetAllData = useCallback(() => {
    if (
      !window.confirm(
        'سيتم حذف الإعدادات والسجل والمسرد والمفتاح المحفوظ نهائيًا من هذا الجهاز. هل تريد المتابعة؟',
      )
    ) {
      return;
    }
    clearAllStoredData();
    clearStoredApiKey();
    setHistory([]);
    setGlossary([]);
    setResult(null);
    setLiveSegments([]);
    setHasPersistedKey(false);
    const fresh: AppSettings = { ...DEFAULT_SETTINGS, userApiKey: '' };
    setSettings(fresh);
    saveSettings(fresh);
    setGateOpen(true);
    toasts.success('تم التصفير', 'أُعيد التطبيق إلى حالته الافتراضية وأُزيل المفتاح.');
  }, [toasts]);

  const cycleTheme = useCallback(() => {
    const order: ThemeMode[] = ['dark', 'light', 'system'];
    const index = order.indexOf(settings.theme);
    patchSettings({ theme: order[(index + 1) % order.length] ?? 'dark' });
  }, [patchSettings, settings.theme]);

  return (
    <div className="app-shell min-h-dvh">
      <AppHeader
        online={online}
        serverKeyConfigured={serverKeyConfigured}
        userKeyConfigured={settings.userApiKey.trim().length > 0}
        serverReachable={serverReachable}
        {...(activeModel ? { activeModel } : {})}
        theme={settings.theme}
        onCycleTheme={cycleTheme}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenHistory={() => setDrawerOpen(true)}
        onOpenInstall={() => setInstallOpen(true)}
        onOpenGlossary={() => setGlossaryOpen(true)}
        historyCount={history.length}
        glossaryCount={glossary.length}
      />

      <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-7">
        {!online ? (
          <div className="mb-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-800 dark:text-amber-200">
            لا يوجد اتصال بالإنترنت — يمكنك التسجيل والكتابة، وستحتاج الاتصال لإتمام الترجمة.
          </div>
        ) : null}

        {settings.userApiKey.trim().length === 0 ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-800 dark:text-rose-200">
            <span>
              لم تُضف مفتاح Gemini بعد. هذا التطبيق يعمل بمفتاح كل مستخدم على حدة، والترجمة لن تعمل قبل إضافته.
            </span>
            <button
              type="button"
              onClick={() => setGateOpen(true)}
              className="rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-rose-500"
            >
              إضافة المفتاح الآن
            </button>
          </div>
        ) : null}

        <TranslationToolbar
          sourceLang={sourceLang}
          targetLang={targetLang}
          preset={preset}
          tone={tone}
          customContext={customContext}
          {...(detectedLanguage ? { detectedLanguage } : {})}
          disabled={processing || textProcessing}
          onSourceLangChange={setSourceLang}
          onTargetLangChange={setTargetLang}
          onSwap={() => {
            const nextSource = targetLang;
            const nextTarget = sourceLang === 'auto' ? 'en' : sourceLang;
            setSourceLang(nextSource);
            setTargetLang(nextTarget);
          }}
          onPresetChange={setPreset}
          onToneChange={setTone}
          onCustomContextChange={setCustomContext}
        />

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div
                role="tablist"
                aria-label="طريقة الإدخال"
                className="inline-flex rounded-2xl border border-slate-200 bg-white/70 p-1 dark:border-slate-700 dark:bg-slate-900/60"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={inputMode === 'audio'}
                  onClick={() => setInputMode('audio')}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
                    inputMode === 'audio'
                      ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/30'
                      : 'text-slate-600 hover:text-brand-700 dark:text-slate-300'
                  }`}
                >
                  <Mic className="size-4" aria-hidden />
                  صوت
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={inputMode === 'text'}
                  onClick={() => setInputMode('text')}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-colors ${
                    inputMode === 'text'
                      ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/30'
                      : 'text-slate-600 hover:text-brand-700 dark:text-slate-300'
                  }`}
                >
                  <Keyboard className="size-4" aria-hidden />
                  نص
                </button>
              </div>

              {inputMode === 'audio' ? (
                <div
                  role="group"
                  aria-label="نمط التسجيل"
                  className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200 bg-white/70 p-1 dark:border-slate-700 dark:bg-slate-900/60"
                >
                  {(Object.keys(RECORDER_MODE_LABELS) as RecorderMode[]).map((modeId) => {
                    const option = RECORDER_MODE_LABELS[modeId];
                    const active = recorderMode === modeId;
                    return (
                      <button
                        key={modeId}
                        type="button"
                        onClick={() => {
                          if (recorder.isRecording) {
                            toasts.warning('أوقف التسجيل أولًا', 'لا يمكن تغيير النمط أثناء التسجيل.');
                            return;
                          }
                          setRecorderMode(modeId);
                          patchSettings({ defaultRecorderMode: modeId });
                          if (modeId === 'continuous') setLiveView(true);
                        }}
                        aria-pressed={active}
                        title={option.descriptionAr}
                        className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
                          active
                            ? 'bg-brand-600 text-white shadow-sm shadow-brand-500/30'
                            : 'text-slate-600 hover:text-brand-700 dark:text-slate-300'
                        }`}
                      >
                        <span aria-hidden>{option.emoji}</span>
                        {option.ar}
                        {modeId === 'continuous' && active ? (
                          <span className="size-1.5 animate-pulse rounded-full bg-emerald-300" aria-hidden />
                        ) : null}
                      </button>
                    );
                  })}
                  {recorderMode === 'continuous' && recorder.isRecording ? (
                    <span className="ms-1 flex items-center gap-1.5 pe-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                      <Radio className="size-3.5 animate-pulse" aria-hidden />
                      يستمع ويُرسل عند السكوت
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={inputMode}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="min-w-0"
              >
                {inputMode === 'audio' ? (
                  <RecorderCard
                    mode={recorderMode}
                    phase={processing ? 'processing' : recorder.phase}
                    isRecording={recorder.isRecording}
                    elapsedMs={recorder.elapsedMs}
                    segmentElapsedMs={recorder.segmentElapsedMs}
                    levelsRef={recorder.levelsRef}
                    recorderError={recorder.error}
                    supported={recorder.supported}
                    mimeType={recorder.mimeType}
                    devices={recorder.devices}
                    selectedDeviceId={recorder.selectedDeviceId}
                    vadSilenceMs={settings.vadSilenceMs}
                    minSegmentMs={settings.minSegmentMs}
                    onSelectDevice={recorder.selectDevice}
                    onToggle={recorderMode === 'continuous' ? () => void recorderRef.current.toggle('continuous') : handleToggleRecording}
                    onPressStart={handlePressStart}
                    onPressEnd={handlePressEnd}
                    onCancel={handleCancelRecording}
                    onSubmitAudio={(batch) => {
                      registerAudioUrl(batch.audioUrl);
                      void submitAudio(batch);
                    }}
                    onError={(message) => toasts.error('خطأ في التسجيل', message)}
                    onSensitivityChange={(silenceMs) => patchSettings({ vadSilenceMs: silenceMs })}
                    onClearError={recorder.clearError}
                  />
                ) : (
                  <TextComposer
                    value={text}
                    loading={textProcessing}
                    targetLang={targetLang}
                    disabled={processing}
                    onChange={setText}
                    onSubmit={() => void submitText()}
                    onPaste={() => {
                      void navigator.clipboard
                        ?.readText()
                        .then((clip) => {
                          if (clip.trim()) setText((current) => (current ? `${current}\n${clip}` : clip));
                          else toasts.info('الحافظة فارغة', 'لا يوجد نص للصق.');
                        })
                        .catch(() => toasts.error('تعذّر الوصول إلى الحافظة', 'الصق النص يدويًا.'));
                    }}
                    onClear={() => setText('')}
                    onQuickSample={(sample) => {
                      setText(sample);
                      setInputMode('text');
                    }}
                  />
                )}
              </motion.div>
            </AnimatePresence>

            {retryPayload ? (
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs font-semibold text-rose-800 dark:text-rose-200">
                <span>فشلت المحاولة الأخيرة. يمكنك إعادة إرسال نفس المدخل.</span>
                <button
                  type="button"
                  onClick={retryLast}
                  className="rounded-xl bg-rose-600 px-3 py-1.5 font-bold text-white transition-colors hover:bg-rose-500"
                >
                  إعادة المحاولة
                </button>
              </div>
            ) : null}

            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: 'ترجمات محفوظة', value: history.length, icon: History },
                { label: 'مصطلحات المسرد', value: stats.terms, icon: Languages },
                { label: 'مقاطع البث', value: stats.segments, icon: AudioLines },
              ].map((card) => (
                <div
                  key={card.label}
                  className="glass-panel rounded-2xl px-3 py-2.5 text-slate-700 dark:text-slate-200"
                >
                  <card.icon className="mx-auto mb-1 size-4 text-brand-600 dark:text-brand-300" aria-hidden />
                  <p className="numeric text-lg font-extrabold">{card.value}</p>
                  <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">{card.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <ResultPanel
              result={result}
              processing={processing || textProcessing}
              onCopySource={() => void handleCopy(result?.transcription ?? result?.sourceText ?? '', 'تم نسخ النص الأصلي.')}
              onCopyTranslation={() => void handleCopy(result?.translation ?? '', 'تم نسخ الترجمة.')}
              onStar={() => result && toggleFavorite(result.id)}
              onShare={() => void handleShare(result?.translation ?? '')}
              starred={Boolean(result && history.find((item) => item.id === result.id)?.favorite)}
              onSpeakSource={() =>
                result &&
                speak(result.transcription || result.sourceText, result.sourceLang === 'auto' ? 'en' : result.sourceLang, 'source')
              }
              onSpeakTarget={() => result && speak(result.translation, result.targetLang, 'target')}
              speakingId={speakingId}
              speechSupported={speech.supported}
              sourceLangLabel={sourceLabel}
              targetLangLabel={targetLabel}
              targetLangCode={targetLang}
            />

            {liveView || liveSegments.length > 0 ? (
              <LiveFeed
                segments={liveSegments}
                onReplay={replaySegment}
                onRetry={retrySegment}
                onClear={clearLiveFeed}
                onCopySegment={(segment) => void handleCopy(segment.translation, 'تم نسخ ترجمة المقطع.')}
                onSpeakSegment={(segment) => speak(segment.translation, targetLang, segment.id)}
                isRecording={recorder.isRecording}
                targetLangLabel={targetLabel}
              />
            ) : null}
          </div>
        </div>

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/70 pt-4 text-[11px] text-slate-500 dark:border-slate-800/70 dark:text-slate-400">
          <p>
            ملفاتك الصوتية تُرسل إلى Gemini للترجمة الفورية، ويبقى السجل والمصطلحات على جهازك فقط.
            {hasPersistedKey ? ' مفتاحك محفوظ مشفّرًا على هذا الجهاز.' : ' مفتاحك غير محفوظ على هذا الجهاز.'}
          </p>
          <p className="numeric">
            {activeModel ? `الموديل النشط: ${activeModel}` : 'الموديل: يُحدَّد عند أول ترجمة'} · مفتاح:{' '}
            {settings.userApiKey.trim()
              ? hasPersistedKey
                ? 'مفتاحك (محفوظ)'
                : 'مفتاحك (هذه الجلسة)'
              : 'غير مضبوط'}
            {authMode === 'hybrid' ? ' · مفتاح احتياطي على الخادم' : ''}
            {statusError ? ` · ${statusError}` : ''}
          </p>
        </footer>
      </main>

      <HistoryDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        items={history}
        onToggleFavorite={toggleFavorite}
        onDelete={deleteHistoryItem}
        onClearAll={clearHistory}
        onCopy={(item) => void handleCopy(item.translation, 'تم نسخ الترجمة.')}
        onSpeak={(item) => speak(item.translation, item.targetLang, item.id)}
        onSelect={handleSelectHistory}
        onExportJson={exportJson}
        onExportText={exportText}
        speakingId={speakingId}
        speechSupported={speech.supported}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSave={patchSettings}
        serverKeyConfigured={serverKeyConfigured}
        authMode={authMode}
        hasPersistedKey={hasPersistedKey}
        statusError={statusError}
        voices={speech.voices}
        onTestVoice={handleTestVoice}
        onValidateKey={handleValidateKey}
        onForgetKey={forgetUserKey}
        onResetData={resetAllData}
      />

      <InstallGuide open={installOpen} onClose={() => setInstallOpen(false)} />

      <GlossaryPanel
        open={glossaryOpen}
        onClose={() => setGlossaryOpen(false)}
        entries={glossary}
        onDelete={deleteGlossaryEntry}
        onClear={clearGlossary}
        onSpeak={(entry) => speak(entry.translation || entry.term, entry.targetLang, entry.id)}
      />

      <ApiKeyGate
        open={gateOpen && keyHydrated}
        hasStoredKey={hasPersistedKey}
        authMode={authMode}
        serverReachable={serverReachable}
        saving={savingKey}
        onSave={saveUserKey}
        onOpenSettings={() => {
          setGateOpen(false);
          setSettingsOpen(true);
        }}
      />

      <ToastStack toasts={toasts.toasts} onDismiss={toasts.dismiss} />
    </div>
  );
}
