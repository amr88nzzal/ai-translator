/** Toast queue used for copy/share/export feedback and Arabic error banners. */
import { useCallback, useMemo, useRef, useState } from 'react';
import type { ToastMessage } from '../types';
import { uid } from '../lib/utils';

export interface ToastApi {
  toasts: ToastMessage[];
  push: (toast: Omit<ToastMessage, 'id'> & { id?: string }) => string;
  success: (title: string, description?: string) => string;
  error: (title: string, description?: string) => string;
  info: (title: string, description?: string) => string;
  warning: (title: string, description?: string) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

const DEFAULT_TTL = 4800;
const ERROR_TTL = 9000;

export function useToasts(): ToastApi {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback<ToastApi['push']>(
    (toast) => {
      const id = toast.id ?? uid('toast');
      setToasts((current) => [...current.slice(-3), { ...toast, id }]);
      const ttl = toast.tone === 'error' ? ERROR_TTL : DEFAULT_TTL;
      const timer = setTimeout(() => dismiss(id), ttl);
      timers.current.set(id, timer);
      return id;
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      toasts,
      push,
      dismiss,
      success: (title, description) => push({ tone: 'success', title, ...(description ? { description } : {}) }),
      error: (title, description) => push({ tone: 'error', title, ...(description ? { description } : {}) }),
      info: (title, description) => push({ tone: 'info', title, ...(description ? { description } : {}) }),
      warning: (title, description) => push({ tone: 'warning', title, ...(description ? { description } : {}) }),
      clear: () => setToasts([]),
    }),
    [toasts, push, dismiss],
  );

  return api;
}
