import path from 'node:path';
import process from 'node:process';

/**
 * The production bundle is CJS (`dist/server.cjs`), where `__dirname` exists.
 * Declared here so TypeScript stays happy while the ESM dev path never touches it.
 */
declare const __dirname: string | undefined;

/**
 * Resolve the project root in BOTH module systems without depending on ESM-only
 * constructs such as `import.meta.url` (which breaks a CJS production bundle).
 *
 * Order of preference:
 *  1. `DSH_APP_ROOT` / `APP_ROOT` override (container platforms).
 *  2. `__dirname` when running inside a CJS bundle (`dist/server.cjs`).
 *  3. `process.cwd()` — the documented way to launch the server.
 */
export function getAppRoot(): string {
  const override = process.env.DSH_APP_ROOT ?? process.env.APP_ROOT;
  if (override && override.trim().length > 0) return path.resolve(override.trim());

  const cjsDir = typeof __dirname !== 'undefined' ? __dirname : undefined;
  if (cjsDir) {
    // In production the bundle lives in <root>/dist/server.cjs
    const candidate = path.resolve(cjsDir, '..');
    if (path.basename(cjsDir) === 'dist') return candidate;
    // In development tsx runs <root>/server/index.ts
    if (path.basename(cjsDir) === 'server') return path.resolve(cjsDir, '..');
    return candidate;
  }

  return process.cwd();
}

export const APP_ROOT = getAppRoot();
export const CLIENT_ROOT = path.join(APP_ROOT, 'client');
export const CLIENT_DIST = path.join(APP_ROOT, 'dist', 'client');
export const PUBLIC_ROOT = path.join(CLIENT_ROOT, 'public');

export const isProduction = (): boolean => process.env.NODE_ENV === 'production';
