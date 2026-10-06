/**
 * يتحقق من قواعد صيغة المفتاح في الخادم مقابل حالات حقيقية ومشكوك فيها.
 *
 * التشغيل (يُحزَّم أولًا لأن `server/*` يستخدم امتدادات `.js` في الاستيراد،
 * وNode لا يستطيع تجريد الأنواع معها):
 *   node scripts/check-key-formats.mjs
 * السكربت يعيد تحزيم نفسه بـ esbuild ثم ينفّذ الناتج.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const bundlePath = path.join(root, '.tmp-key-format-check.cjs');

// إذا نُفِّذ الملف كحزمة (وليس كنقطة بداية)، نجد رمز التحقق في النطاق العام.
const runChecks = (validateApiKeyFormat) => {
  const cases = [
    // [المفتاح, متوقع أن يُقبل شكلًا؟, الوصف]
    ['AQ.Ab8RN6I9-ZQG', true, 'مثال المستخدم الحقيقي (16 محرفًا)'],
    ['AQ.Ab8RN6I9-ZQGxK4mP2vL7dR9tY3nB5cF8hJ1sW6eA0uI4oQ', true, 'مفتاح AQ. بطول واقعي'],
    ['AIzaSyDUMMYKEYFORFORMATTEST1234567890', true, 'مفتاح AIza كلاسيكي'],
    ['AIzaSyA-1_b2C3d4E5f6G7h8I9j0K1l2M3n4O5p', true, 'AIza مع شرطات وشرطات سفلية'],
    ['ya29.a0AfH6SMBexample', false, 'رمز OAuth مؤقت'],
    ['AQ.sh', false, 'AQ. أقصر من الحد الشكلي'],
    ['not-a-key-at-all-but-long-enough', false, 'نص عشوائي بلا بادئة معروفة'],
    ['AIzaSyWith Space Inside1234567890', false, 'يحتوي مسافة'],
    ['AIzaSyTruncated12345', false, 'AIza مقطوع (18 محرفًا)'],
    ['', false, 'فارغ'],
    ['   ', false, 'مسافات فقط'],
  ];

  let failures = 0;

  for (const [key, expected, label] of cases) {
    const result = validateApiKeyFormat(key);
    const ok = result.valid === expected;
    if (!ok) failures += 1;
    const shown = key.length > 34 ? `${key.slice(0, 31)}…` : key;
    console.log(
      `${ok ? '[ok]  ' : '[FAIL]'} ${expected ? 'مقبول' : 'مرفوض'} · ${label.padEnd(38)} · ${JSON.stringify(shown)}${
        !ok && result.reason ? `\n         السبب: ${result.reason}` : ''
      }`,
    );
  }

  console.log('');
  if (failures > 0) {
    console.log(`[FAIL] ${failures} حالة لا تطابق المتوقع`);
    return 1;
  }
  console.log(`[ok] كل الحالات (${cases.length}) مطابقة.`);
  return 0;
};

/** وضع الحزمة: يستورد القاعدة من الخادم ثم ينفّذ الفحوص. */
async function bundleAndRun() {
  const esbuildBin = path.join(root, 'node_modules', '@esbuild', `win32-${process.arch}`, 'esbuild.exe');
  const esbuildCmd = fs.existsSync(esbuildBin)
    ? esbuildBin
    : path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild');

  // نحزم ملفًا صغيرًا يُصدِّر القاعدة فقط (بلا أي آثار جانبية عند الاستيراد).
  const entry = path.join(root, '.tmp-key-format-entry.ts');
  fs.writeFileSync(entry, "export { validateApiKeyFormat } from './server/gemini.js';\n", 'utf8');

  try {
    const bundle = spawnSync(
      esbuildCmd,
      [
        entry,
        '--bundle',
        '--platform=node',
        '--format=cjs',
        `--outfile=${bundlePath}`,
        '--log-level=warning',
      ],
      { stdio: 'inherit', cwd: root },
    );
    if (bundle.status !== 0) return 1;

    const mod = await import(`file://${bundlePath.replace(/\\/g, '/')}`);
    const validate = mod.validateApiKeyFormat ?? mod.default?.validateApiKeyFormat;
    if (typeof validate !== 'function') {
      console.error('[FAIL] تعذّر الوصول إلى validateApiKeyFormat من الحزمة');
      return 1;
    }
    return runChecks(validate);
  } finally {
    fs.rmSync(entry, { force: true });
    fs.rmSync(bundlePath, { force: true });
  }
}

// نُصدّر الدالة أيضًا ليستوردها القائد عند الحاجة.
export { runChecks };

const exitCode = await bundleAndRun();
process.exit(exitCode);

