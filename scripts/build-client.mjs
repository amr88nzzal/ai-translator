/**
 * Client build (`pnpm build:client`).
 *
 * Runs on plain Node (no TypeScript transform, so nothing spawns a helper
 * process) and applies the Windows realpath patch *before* Vite loads.
 */
import process from 'node:process';
import { build } from 'vite';
import { applyViteRealpathPatch, describePatch } from './vite-realpath-patch.mjs';

applyViteRealpathPatch();
process.env.NODE_ENV = process.env.NODE_ENV ?? 'production';

console.log(`[i] ${describePatch()}`);

const { viteConfig, CLIENT_DIST } = await import('../vite.config.mjs');
const started = Date.now();

try {
  await build({ ...viteConfig, configFile: false });
  console.log(`[ok] client bundle written to ${CLIENT_DIST} in ${Date.now() - started}ms`);
} catch (error) {
  console.error('[fail] client build failed:', error instanceof Error ? error.message : String(error));
  if (error instanceof Error && error.stack) console.error(error.stack);
  process.exit(1);
}
