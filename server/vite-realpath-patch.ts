/**
 * Windows-only workaround for Vite's "safe realpath" probe.
 *
 * Why this exists
 * ---------------
 * Vite (7 and 8) inspects mapped network drives before resolving paths:
 *
 *   function optimizeSafeRealPathSync() {
 *     try { fs.realpathSync.native(path.resolve('./')); }
 *     catch (error) { if (error.message.includes('EISDIR…')) return fallback(); }
 *     exec('net use', …)          // ← spawns a child process
 *   }
 *
 * The `exec('net use')` probe spawns `cmd.exe`. In sandboxed/restricted Windows
 * environments (CI runners, locked-down corporate machines, agent sandboxes) that
 * spawn is denied with `EPERM`, which Vite rethrows and the build dies before it
 * starts — even though the network-drive workaround is irrelevant to a local
 * project path.
 *
 * What this patch does
 * --------------------
 * It makes the probe fail the way Vite already handles gracefully, so Vite falls
 * back to plain `fs.realpathSync` and never shells out. Nothing else in Vite is
 * modified, and the patch is a no-op on non-Windows platforms.
 *
 * Import this module *before* `vite` is imported (or before `vite.config.ts` is
 * evaluated) — see `server/dev.ts` and `scripts/build-client.mjs`.
 */
import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

type ExecLike = typeof childProcess.exec;
type RealpathNative = typeof fs.realpathSync.native;

interface PatchState {
  applied: boolean;
  /** True when `child_process.exec` was actually replaced. */
  replacedExec: boolean;
}

const state: PatchState = { applied: false, replacedExec: false };

/** EISDIR-shaped error: Vite treats it as "native realpath unusable here". */
const eisdirError = (): Error =>
  Object.assign(new Error('EISDIR: illegal operation on a directory, realpath'), {
    code: 'EISDIR',
    errno: -4068,
    syscall: 'realpath',
  });

export function applyViteRealpathPatch(): PatchState {
  if (state.applied) return state;
  state.applied = true;

  if (process.platform !== 'win32') return state;

  const originalExec = childProcess.exec as ExecLike;

  // 1) Neutralise the `net use` probe: report the EISDIR shape Vite treats as
  //    "native realpath is unusable here", which selects its safe fallback.
  const patchedExec = function patchedExec(
    command: string,
    ...rest: unknown[]
  ): ReturnType<ExecLike> {
    if (typeof command === 'string' && command.trim().toLowerCase().startsWith('net use')) {
      const callback = rest.find((arg): arg is (error: Error | null, stdout: string, stderr: string) => void =>
        typeof arg === 'function',
      );
      const error = eisdirError();
      if (callback) {
        process.nextTick(() => callback(error, '', ''));
        return undefined as unknown as ReturnType<ExecLike>;
      }
      throw error;
    }
    return (originalExec as (...args: unknown[]) => ReturnType<ExecLike>)(command, ...rest);
  };

  try {
    (childProcess as unknown as { exec: unknown }).exec = patchedExec;
    state.replacedExec = true;
  } catch {
    // Frozen module namespace: the fallback below still removes the hard failure.
  }

  // 2) Belt and braces: make the native call report the same error directly, so
  //    Vite never reaches the probe in the first place.
  //
  //    Note: only the exact `path.resolve('./')` probe is failed. Node's own
  //    loader also calls this function, so any other argument must pass through
  //    untouched or module resolution itself would break.
  try {
    const originalNative = fs.realpathSync.native.bind(fs.realpathSync) as RealpathNative;
    const resolvedCwd = path.resolve('./');

    const probe = ((target: fs.PathLike, options?: unknown): string => {
      if (typeof target === 'string' && path.resolve(target) === resolvedCwd) {
        throw Object.assign(new Error('EISDIR: illegal operation on a directory, realpath'), { code: 'EISDIR' });
      }
      const native = originalNative as unknown as (t: fs.PathLike, o?: unknown) => string | Buffer;
      const result = native(target, options);
      return typeof result === 'string' ? result : result.toString();
    }) as unknown as RealpathNative;

    (fs.realpathSync as unknown as { native: RealpathNative }).native = probe;
  } catch {
    // If the property is read-only, the exec patch alone is enough.
  }

  return state;
}

/** True when Vite can safely resolve the project root without spawning a shell. */
export const viteRealpathPatched = (): boolean => state.applied;

/** Convenience wrapper used by the build script for logging. */
export function describePatch(): string {
  if (process.platform !== 'win32') return 'realpath patch not required (non-Windows)';
  applyViteRealpathPatch();
  return state.replacedExec
    ? `realpath patch active for ${path.basename(process.cwd())}`
    : 'realpath patch applied (exec already wrapped)';
}

export default applyViteRealpathPatch;
