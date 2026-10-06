/**
 * Text-to-speech via the Web Speech API (`speechSynthesis`) with voice
 * discovery, language matching and configurable speed.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LanguageOption, SpeechVoiceOption } from '../types';

export interface UseSpeechOptions {
  rate: number;
  volume: number;
  preferredVoiceUri: string;
}

export interface SpeechApi {
  supported: boolean;
  voices: SpeechVoiceOption[];
  speakingId: string | null;
  speak: (text: string, language: LanguageOption | undefined, id?: string) => void;
  stop: () => void;
  test: (language: LanguageOption | undefined) => void;
  /** Voices that match the given language, best first. */
  voicesFor: (language: LanguageOption | undefined) => SpeechVoiceOption[];
}

const SAMPLE: Record<string, string> = {
  ar: 'مرحبًا، هذه تجربة لصوت الترجمة العربية.',
  en: 'Hello, this is a sample of the translation voice.',
  fr: 'Bonjour, ceci est un test de la voix de traduction.',
  es: 'Hola, esta es una prueba de la voz de traducción.',
  de: 'Hallo, dies ist ein Test der Übersetzungsstimme.',
  tr: 'Merhaba, bu bir çeviri sesi denemesidir.',
  ru: 'Здравствуйте, это проверка голоса перевода.',
};

export function useSpeech(options: UseSpeechOptions): SpeechApi {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [voices, setVoices] = useState<SpeechVoiceOption[]>([]);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;

    const load = (): void => {
      if (cancelled) return;
      const list = window.speechSynthesis.getVoices().map((voice) => ({
        uri: voice.voiceURI,
        name: voice.name,
        lang: voice.lang,
        localService: voice.localService,
      }));
      if (list.length > 0) setVoices(list);
    };

    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    // Safari populates voices late; poll a few times as a safety net.
    const timers = [400, 1200, 2500].map((delay) => setTimeout(load, delay));
    return () => {
      cancelled = true;
      window.speechSynthesis.removeEventListener('voiceschanged', load);
      timers.forEach(clearTimeout);
    };
  }, [supported]);

  const voicesFor = useCallback(
    (language: LanguageOption | undefined): SpeechVoiceOption[] => {
      if (!language) return voices;
      const hints = language.voiceHints ?? [language.speechTag.toLowerCase()];
      const scored = voices
        .map((voice) => {
          const lang = voice.lang.toLowerCase();
          const index = hints.findIndex((hint) => lang === hint.toLowerCase() || lang.startsWith(hint.slice(0, 2)));
          const exact = hints.findIndex((hint) => lang === hint.toLowerCase());
          const score = exact >= 0 ? 100 - exact : index >= 0 ? 50 - index : -1;
          return { voice, score };
        })
        .filter((entry) => entry.score >= 0)
        .sort((a, b) => b.score - a.score);
      return scored.map((entry) => entry.voice);
    },
    [voices],
  );

  const pickVoice = useCallback(
    (language: LanguageOption | undefined): SpeechSynthesisVoice | null => {
      if (!supported) return null;
      const available = window.speechSynthesis.getVoices();
      const preferred = optionsRef.current.preferredVoiceUri;
      if (preferred) {
        const found = available.find((voice) => voice.voiceURI === preferred);
        if (found) return found;
      }
      const candidates = voicesFor(language);
      const first = candidates[0];
      if (!first) return null;
      return available.find((voice) => voice.voiceURI === first.uri) ?? null;
    },
    [supported, voicesFor],
  );

  const speak = useCallback(
    (text: string, language: LanguageOption | undefined, id?: string) => {
      if (!supported || !text.trim()) return;
      const synth = window.speechSynthesis;
      synth.cancel();

      const utterance = new SpeechSynthesisUtterance(text.slice(0, 6000));
      const voice = pickVoice(language);
      if (voice) utterance.voice = voice;
      utterance.lang = voice?.lang ?? language?.speechTag ?? 'ar-SA';
      utterance.rate = optionsRef.current.rate;
      utterance.volume = optionsRef.current.volume;

      const speakId = id ?? `speak_${Date.now()}`;
      utterance.onend = () => setSpeakingId((current) => (current === speakId ? null : current));
      utterance.onerror = () => setSpeakingId((current) => (current === speakId ? null : current));

      setSpeakingId(speakId);
      synth.speak(utterance);
    },
    [pickVoice, supported],
  );

  const stop = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeakingId(null);
  }, [supported]);

  const test = useCallback(
    (language: LanguageOption | undefined) => {
      const code = language?.code === 'auto' ? 'ar' : language?.code ?? 'ar';
      const sample = SAMPLE[code] ?? SAMPLE.en ?? 'Sample.';
      speak(sample, language, 'voice-test');
    },
    [speak],
  );

  // Cancel any pending utterance when the component tree unmounts.
  useEffect(
    () => () => {
      if (supported) window.speechSynthesis.cancel();
    },
    [supported],
  );

  return useMemo(
    () => ({ supported, voices, speakingId, speak, stop, test, voicesFor }),
    [supported, voices, speakingId, speak, stop, test, voicesFor],
  );
}
