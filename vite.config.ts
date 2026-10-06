/**
 * TypeScript view of the Vite configuration.
 *
 * The authoritative config lives in `vite.config.mjs` (plain ESM) so the build
 * scripts can import it without a TypeScript transform. This file re-exports it,
 * which keeps `vite.config.ts` the file Vite and editors discover by default,
 * while the real values stay in one place.
 */
// @ts-expect-error -- plain-JS module without type declarations
import { viteConfig, CLIENT_DIST, CLIENT_ROOT, PROJECT_ROOT } from './vite.config.mjs';

export { CLIENT_DIST, CLIENT_ROOT, PROJECT_ROOT };
export default viteConfig;
