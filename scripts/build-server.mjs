/**
 * Server bundling (`pnpm build:server`).
 *
 *   server/start.ts -> dist/server.cjs   (production: API + pre-built client)
 *   server/dev.ts   -> dist/dev.cjs      (development: API + Vite middleware)
 *
 * المنفذ افتراضيًا 3500 (راجع server/config.ts و .env.example و compose.yaml).
 *
 * Why CJS: container platforms run the bundle straight with `node dist/server.cjs`
 * and CJS avoids ESM/CJS interop surprises for Express. `@google/genai`,
 * `express` and `vite` stay external: their published builds expose a working
 * CJS entry, and `vite` must never be required on the production path.
 *
 * Two execution paths, same result:
 *   1. the esbuild JavaScript API (in-process);
 *   2. the esbuild CLI, used automatically when the sandbox forbids spawning a
 *      child process with piped stdio (the API reports `spawn EPERM`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import esbuild from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const distDir = path.join(root, 'dist');

fs.mkdirSync(distDir, { recursive: true });

const EXTERNALS = ['@google/genai', 'express', 'vite'];

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  sourcemap: false,
  minify: false,
  legalComments: 'none',
  logLevel: 'warning',
  external: EXTERNALS,
};

const targets = [
  { entry: path.join(root, 'server', 'start.ts'), outfile: path.join(distDir, 'server.cjs') },
  { entry: path.join(root, 'server', 'dev.ts'), outfile: path.join(distDir, 'dev.cjs') },
];

const started = Date.now();

/** Locates the platform esbuild executable bundled by the npm package. */
function resolveEsbuildBinary() {
  const require = createRequire(import.meta.url);
  const candidates = [];
  try {
    const pkgPath = require.resolve('esbuild/package.json');
    candidates.push(path.join(path.dirname(pkgPath), 'bin', 'esbuild'));
  } catch {
    /* fall through to the node_modules probe below */
  }
  candidates.push(
    path.join(root, 'node_modules', '@esbuild', `win32-${process.arch}`, 'esbuild.exe'),
    path.join(root, 'node_modules', '.bin', 'esbuild'),
    path.join(root, 'node_modules', '.bin', 'esbuild.cmd'),
  );
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function buildWithCli(target, binary) {
  const args = [
    target.entry,
    '--bundle',
    '--platform=node',
    '--target=node20',
    '--format=cjs',
    `--outfile=${target.outfile}`,
    ...EXTERNALS.map((name) => `--external:${name}`),
    '--log-level=warning',
  ];

  const result = spawnSync(binary, args, { stdio: 'inherit', cwd: root, shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`esbuild CLI exited with code ${String(result.status)}`);
}

async function buildWithApi(target) {
  await esbuild.build({
    ...shared,
    entryPoints: [target.entry],
    outfile: target.outfile,
    banner: { js: '/* server bundle (CJS) */' },
  });
}

let binary = null;

for (const target of targets) {
  try {
    await buildWithApi(target);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/EPERM|spawn/i.test(message)) throw error;

    if (!binary) {
      binary = resolveEsbuildBinary();
      if (!binary) throw new Error('esbuild executable not found; run the package manager install again.');
      console.log('[i] esbuild API blocked by the sandbox, falling back to the esbuild CLI');
    }
    buildWithCli(target, binary);
  }

  const size = fs.statSync(target.outfile).size;
  console.log(`[ok] ${path.relative(root, target.outfile)} (${(size / 1024).toFixed(1)} kB)`);
}

console.log(`[ok] server bundles ready in ${Date.now() - started}ms`);
