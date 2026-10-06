/**
 * Shared Vite configuration (plain ESM so it can be imported from build scripts
 * and loaded by Vite without a TypeScript transform step).
 *
 * `clientRoot` is derived from this file's own location, so it works no matter
 * which directory the build is started from.
 */
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = here;
export const CLIENT_ROOT = path.join(here, 'client');
export const CLIENT_DIST = path.join(here, 'dist', 'client');

/** @type {import('vite').UserConfig} */
export const viteConfig = {
  root: CLIENT_ROOT,
  base: '/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.join(CLIENT_ROOT, 'src'),
      '@shared': path.join(here, 'shared'),
    },
  },
  server: {
    host: true,
    strictPort: false,
    // The Express layer owns /manifest.json and /sw.js; Vite serves the rest.
    fs: { allow: [here] },
  },
  build: {
    outDir: CLIENT_DIST,
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
    // No `manualChunks` map here: Vite 8 bundles with Rolldown, which (like
    // Rollup) requires the function form. The default splitting is good enough
    // for this app shell, so we let the bundler decide.
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'lucide-react', 'motion'],
  },
};

export default viteConfig;
