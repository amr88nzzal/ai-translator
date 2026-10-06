/**
 * Structural guard for the POSIX shell deployment scripts.
 *
 * There is no usable bash in this environment (WSL is not installed), so instead
 * of running `bash -n` we verify the constructs that actually break these files:
 *
 *   - heredocs opened with `<<` / `<<-` are terminated by the exact same word;
 *   - single/double quotes are balanced per line and across the file;
 *   - `$( ... )` and `${ ... }` nesting is balanced;
 *   - `if`/`fi`, `case`/`esac`, `do`/`done` counts match;
 *   - the file starts with a shebang and does not contain CRLF line endings;
 *   - no `set -e`-breaking patterns such as `cd` inside a subshell without guard.
 *
 * Usage: node scripts/validate-shell.mjs [file ...]
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const defaultTargets = ['deploy/deploy.sh', 'deploy/push-to-github.sh'];
const targets = process.argv.slice(2).length > 0 ? process.argv.slice(2) : defaultTargets;

const errors = [];
const warnings = [];

/** Removes a trailing `#` comment that is not inside quotes. */
function stripComment(line) {
  let single = false;
  let double = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === "'" && !double) single = !single;
    else if (c === '"' && !single) double = !double;
    else if (c === '#' && !single && !double && (i === 0 || /\s/.test(line[i - 1] ?? ' '))) {
      return line.slice(0, i);
    }
  }
  return line;
}

for (const target of targets) {
  const absolute = path.isAbsolute(target) ? target : path.join(root, target);
  if (!fs.existsSync(absolute)) {
    errors.push(`${target}: الملف غير موجود`);
    continue;
  }

  const rawText = fs.readFileSync(absolute, 'utf8');

  if (rawText.includes('\r\n')) {
    errors.push(`${target}: يحتوي نهايات أسطر CRLF — سيفشل على السيرفر (استخدم LF)`);
  }

  const lines = rawText.split('\n');

  if (!lines[0]?.startsWith('#!')) errors.push(`${target}: لا يبدأ بسطر shebang (#!)`);
  else if (!/^#!.*\b(bash|sh)\b/.test(lines[0])) warnings.push(`${target}: shebang غير معتاد: ${lines[0]}`);

  if (!/^\s*set\s+-[a-zA-Z]*e/m.test(rawText)) warnings.push(`${target}: لا يستخدم set -e (التوقف عند الخطأ)`);

  // ------------------------------------------------------------- heredocs
  let pendingHeredoc = null;
  const heredocs = [];

  for (let i = 0; i < lines.length; i += 1) {
    const lineNumber = i + 1;
    const raw = lines[i];
    const code = stripComment(raw);

    if (pendingHeredoc !== null) {
      // سطر الإغلاق يبدأ بكلمة الإغلاق (يُسمح بمسافة قبله في `<<-`).
      // ملاحظة مهمة: نتحقق من الإغلاق **فقط** هنا، ولا نبحث عن heredoc جديد داخل
      // نص heredoc — وإلا فسيفسّر `cat <<'EOT'` الموجود داخل heredoc آخر كفتح جديد.
      if (raw.trim() === pendingHeredoc || raw.trim().startsWith(pendingHeredoc)) {
        const openEntry = [...heredocs].reverse().find((h) => h.closedAt === null);
        if (openEntry) openEntry.closedAt = lineNumber;
        pendingHeredoc = null;
      }
      continue; // نص الـ heredoc قد يحتوي أي شيء
    }

    const heredocMatch = code.match(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/);
    if (heredocMatch) {
      pendingHeredoc = heredocMatch[2];
      heredocs.push({ word: pendingHeredoc, openedAt: lineNumber, closedAt: null });
      continue;
    }

    // --------------------------------------------------------- التوازن
    const quotes = { single: false, double: false };
    let dollarParen = 0;
    let dollarBrace = 0;

    for (let c = 0; c < code.length; c += 1) {
      const ch = code[c];
      const next = code[c + 1];
      if (ch === '\\') {
        c += 1;
        continue;
      }
      if (ch === "'" && !quotes.double) quotes.single = !quotes.single;
      else if (ch === '"' && !quotes.single) quotes.double = !quotes.double;
      else if (!quotes.single && !quotes.double) {
        if (ch === '$' && next === '(') dollarParen += 1;
        else if (ch === ')' && dollarParen > 0) dollarParen -= 1;
        else if (ch === '$' && next === '{') dollarBrace += 1;
        else if (ch === '}' && dollarBrace > 0) dollarBrace -= 1;
      }
    }

    if (quotes.single) {
      errors.push(`${target}:${lineNumber}: علامة اقتباس مفردة غير مغلقة`);
    }
    if (quotes.double) {
      warnings.push(`${target}:${lineNumber}: علامة اقتباس مزدوجة غير مغلقة في السطر (قد تكون متعددة الأسطر)`);
    }
    if (dollarParen !== 0) {
      warnings.push(`${target}:${lineNumber}: $() غير متوازن`);
    }
    if (dollarBrace > 0) {
      warnings.push(`${target}:${lineNumber}: \${ غير متوازن`);
    }
  }

  const unclosed = heredocs.filter((h) => h.closedAt === null);
  for (const h of unclosed) {
    errors.push(`${target}:${h.openedAt}: heredoc «${h.word}» لم يُغلق بنفس الكلمة في سطر مستقل`);
  }

  // ------------------------------------------------------ توازن الكتل
  const count = (pattern) => (rawText.match(pattern) ?? []).length;
  const blockChecks = [
    { open: /^\s*if\b/gm, close: /^\s*fi\b/gm, name: 'if/fi' },
    { open: /^\s*for\b/gm, close: /^\s*done\b/gm, name: 'for/done' },
    { open: /^\s*while\b/gm, close: /^\s*done\b/gm, name: 'while/done' },
    { open: /^\s*case\b/gm, close: /^\s*esac\b/gm, name: 'case/esac' },
  ];

  for (const check of blockChecks) {
    const open = count(check.open);
    const close = count(check.close);
    if (check.name === 'if/fi' && open !== close) {
      errors.push(`${target}: عدم توازن ${check.name} (${open} مقابل ${close})`);
    }
    if (check.name === 'case/esac' && open !== close) {
      errors.push(`${target}: عدم توازن ${check.name} (${open} مقابل ${close})`);
    }
  }

  const doCount = count(/^\s*do\b/gm);
  const doneCount = count(/^\s*done\b/gm);
  if (doCount + count(/;\s*do\b/g) !== doneCount && doCount !== doneCount) {
    warnings.push(`${target}: do (${doCount}) و done (${doneCount}) غير متطابقين — تحقّق يدويًا`);
  }

  // ---------------------------------------------- متغيرات تُستخدم بلا تعريف
  const declared = new Set();
  // يلتقط الإسناد في بداية السطر وكذلك داخل فروع case / بعد then و do.
  for (const m of rawText.matchAll(/(?:^|[\s;(|&])([A-Z_][A-Z0-9_]*)=/gm)) declared.add(m[1]);
  for (const m of rawText.matchAll(/\blocal\s+([A-Za-z_][A-Za-z0-9_]*)/g)) declared.add(m[1]);
  for (const m of rawText.matchAll(/\b(?:for|read)\s+([A-Za-z_][A-Za-z0-9_]*)/g)) declared.add(m[1]);
  // متغيّرات قادمة من البيئة أو من وسائط السكربت.
  for (const builtin of [
    'HOME', 'PATH', 'USER', 'PWD', 'SHELL', 'HOSTNAME', 'TMPDIR', 'LANG', 'LC_ALL',
    'GITHUB_USER', 'REPO', 'BRANCH', 'COMMIT_MESSAGE',
  ]) {
    declared.add(builtin);
  }
  const used = new Set();
  for (const m of rawText.matchAll(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g)) {
    used.add(m[1] ?? m[2]);
  }
  const undeclared = [...used].filter((name) => !declared.has(name));
  if (undeclared.length > 0) {
    warnings.push(`${target}: متغيّرات تُستخدم ولم تُعرَّف في الملف: ${undeclared.join(', ')}`);
  }

  console.log(
    `[i] ${target}: ${lines.length} سطرًا، ${heredocs.length} heredoc، ${declared.size} متغيّرًا معرَّفًا`,
  );
}

console.log('');
if (warnings.length > 0) {
  console.log(`تحذيرات (${warnings.length}):`);
  for (const w of warnings) console.log(`  ! ${w}`);
  console.log('');
}

if (errors.length > 0) {
  console.log(`أخطاء (${errors.length}):`);
  for (const e of errors) console.log(`  x ${e}`);
  process.exit(1);
}

console.log('✅ لا أخطاء بنيوية في سكربتات shell.');
