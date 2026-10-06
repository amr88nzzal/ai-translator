/// <reference types="vite/client" />

/** Chromium's install prompt event (not in the standard DOM lib). */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt: () => Promise<void>;
}

/**
 * Registering the event on `WindowEventMap` lets components use plain
 * `window.addEventListener('beforeinstallprompt', handler)` typing — the event
 * is Chromium-only and absent from lib.dom.
 */
interface WindowEventMap {
  beforeinstallprompt: BeforeInstallPromptEvent;
  appinstalled: Event;
}

interface NetworkInformationLike extends EventTarget {
  effectiveType?: string;
  downlink?: number;
  saveData?: boolean;
}

interface Navigator {
  /** iOS Safari exposes `standalone` on navigator rather than on window. */
  standalone?: boolean;
  connection?: NetworkInformationLike;
}

interface Window {
  /** Legacy IE/Edge marker, used only to refine platform detection. */
  MSStream?: unknown;
}

declare module '*.svg' {
  const source: string;
  export default source;
}
