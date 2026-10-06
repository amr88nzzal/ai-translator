/**
 * React bootstrap. The service worker is registered only in production builds so
 * development always serves fresh modules.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('لم يتم العثور على عنصر الجذر #root في الصفحة.');
}

// Applied before the first paint to avoid a light-theme flash.
const storedTheme = (() => {
  try {
    return localStorage.getItem('sct.theme.v1');
  } catch {
    return null;
  }
})();
const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
const useDark = storedTheme === 'dark' || ((storedTheme === 'system' || storedTheme === null) && prefersDark);
document.documentElement.classList.toggle('dark', useDark);
document.documentElement.style.colorScheme = useDark ? 'dark' : 'light';

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/* ------------------------------------------------------ service worker */

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        // Ask a waiting worker to take over on the next navigation.
        registration.addEventListener?.('updatefound', () => {
          registration.installing?.addEventListener('statechange', (event) => {
            const worker = event.target as ServiceWorker | null;
            if (worker?.state === 'installed' && navigator.serviceWorker.controller) {
              worker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });

        // Background sync is used to retry translations queued while offline.
        const withSync = registration as ServiceWorkerRegistration & {
          sync?: { register: (tag: string) => Promise<void> };
        };
        void withSync.sync?.register('sct-retry-translations').catch(() => undefined);
      })
      .catch((error: unknown) => {
        // Registration failures must never break the app shell.
        console.warn('تعذّر تسجيل عامل الخدمة:', error);
      });
  });

  // The worker asks the page to flush anything queued while it was offline.
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent<{ type?: string }>) => {
    if (event.data?.type === 'RETRY_QUEUED_TRANSLATIONS') {
      window.dispatchEvent(new CustomEvent('sct:retry-queued-translations'));
    }
  });
}
