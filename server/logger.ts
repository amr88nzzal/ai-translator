/**
 * Tiny structured logger. API keys must never reach this layer — callers pass
 * only `keySource` ('user' | 'server' | 'none'), never the key material.
 */
type Level = 'info' | 'warn' | 'error';

const stamp = (): string => new Date().toISOString();

const emit = (level: Level, message: string, meta?: Record<string, unknown>): void => {
  const line = `${stamp()} [${level.toUpperCase()}] ${message}`;
  if (level === 'error') {
    console.error(line, meta ?? '');
    return;
  }
  if (level === 'warn') {
    console.warn(line, meta ?? '');
    return;
  }
  console.log(line, meta ?? '');
};

export const logger = {
  info: (message: string, meta?: Record<string, unknown>): void => emit('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>): void => emit('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>): void => emit('error', message, meta),
};
