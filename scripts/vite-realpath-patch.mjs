/**
 * Windows-only workaround for Vite's "safe realpath" probe.
 *
 * Why this exists
 * ---------------
 * Vite inspects mapped network drives before resolving paths:
 *
 *   function optimizeSafeRealPathSync() {
 *     try { fs.realpathSync.native(path.resolve('./')); }
 *     catch (error) { if (error.message.includes('EISDIR…')) return fallback(); }
 *     exec('net use', …)          // ← spawns a child process
 *   }
 *
 * That probe spawns `cmd.exe`. In sandboxed or locked-down Windows environments
 * (CI runners, corporate images, agent sandboxes) the spawn is denied with
 * `EPERM`, which Vite rethrows, so the build dies before it starts — even though
 * the mapped-drive workaround is irrelevant for a local project path.
 *
 * What this patch does
 * --------------------
 * It makes exactly that probe (`fs.realpathSync.native(path.resolve('./'))`)
 * fail with the EISDIR shape Vite already handles gracefully, so Vite falls back
 * to plain `fs.realpathSync` and never shells out.
 *
 * Important: the wrapper must stay transparent for *every other* call. Node's own
 * loader also uses `fs.realpathSync.native`, so returning fabricated errors
 * indiscriminately would break module resolution itself.
 *
 * Plain JS on purpose: the build scripts run on `node` directly, without a
 * TypeScript transform (which would need a helper process of its own). This is
 * the JavaScript twin of `server/vite-realpath-patch.ts`; keep them in sync.
 */
import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const state = { applied: false, execPatched: false };

/** EISDIR-shaped error: Vite treats it as "native realpath unusable here". */
const eisdirError = () =>
  Object.assign(new Error('EISDIR: illegal operation on a directory, realpath'), {
    code: 'EISDIR',
    errno: -4068,
    syscall: 'realpath',
  });

export function applyViteRealpathPatch() {
  if (state.applied) return state;
  state.applied = true;

  if (process.platform !== 'win32') return state;

  // 1) Neutralise the `net use` probe: it is only reached when the native
  //    realpath call threw, so this covers hosts where that call succeeds.
  const originalExec = childProcess.exec;
  childProcess.exec = function patchedExec(command, ...rest) {
    if (typeof command === 'string' && command.trim().toLowerCase().startsWith('net use')) {
      const callback = rest.find((arg) => typeof arg === 'function');
      const error = eisdirError();
      if (callback) {
        process.nextTick(() => callback(error, '', ''));
        return undefined;
      }
      throw error;
    }
    return originalExec.call(childProcess, command, ...rest);
  };
  state.execPatched = childProcess.exec !== originalExec;

  // 2) Fail Vite's own probe so it takes its safe fallback, while staying
  //    transparent for all other callers (including Node's loader).
  try {
    const originalNative = fs.realpathSync.native.bind(fs.realpathSync);
    const resolvedCwd = path.resolve('./');

    fs.realpathSync.native = function patchedNative(target, options) {
      if (typeof target === 'string' && path.resolve(target) === resolvedCwd) throw eisdirError();
      const result = originalNative(target, options);
      return typeof result === 'string' ? result : result.toString();
    };
  } catch {
    // Read-only property: the exec patch alone is enough.
  }

  return state;
}

/** Log-friendly description of what the patch did. */
export function describePatch() {
  if (process.platform !== 'win32') return 'realpath patch not needed (non-Windows)';
  applyViteRealpathPatch();
  return state.execPatched ? 'realpath patch active (net-use probe neutralised)' : 'realpath patch already applied';
}

export default applyViteRealpathPatch;
