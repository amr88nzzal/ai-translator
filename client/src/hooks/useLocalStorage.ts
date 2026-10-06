/** Generic typed localStorage state with lazy hydration. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { safeJsonParse } from '../lib/utils';

export interface LocalStorageState<T> {
  value: T;
  set: (next: T | ((current: T) => T)) => void;
  /** Re-reads the persisted value (used after an external reset). */
  reload: () => void;
  /** Serialised writer escape hatch for non-JSON-able flows. */
  persist: (next: T) => void;
}

export function useLocalStorage<T>(key: string, initial: T, validate?: (raw: unknown) => T): LocalStorageState<T> {
  const validateRef = useRef(validate);
  validateRef.current = validate;

  const read = useCallback((): T => {
    try {
      if (typeof localStorage === 'undefined') return initial;
      const raw = localStorage.getItem(key);
      if (raw === null) return initial;
      const parsed = safeJsonParse<unknown>(raw, initial);
      return validateRef.current ? validateRef.current(parsed) : (parsed as T);
    } catch {
      return initial;
    }
  }, [key, initial]);

  const [value, setValue] = useState<T>(read);

  const persist = useCallback(
    (next: T) => {
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* quota / private mode — keep the in-memory value */
      }
    },
    [key],
  );

  const set = useCallback<LocalStorageState<T>['set']>(
    (next) => {
      setValue((current) => {
        const resolved = typeof next === 'function' ? (next as (c: T) => T)(current) : next;
        persist(resolved);
        return resolved;
      });
    },
    [persist],
  );

  const reload = useCallback(() => setValue(read()), [read]);

  // Keep multiple tabs in sync.
  useEffect(() => {
    const onStorage = (event: StorageEvent): void => {
      if (event.key === key) setValue(read());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key, read]);

  return { value, set, reload, persist };
}
