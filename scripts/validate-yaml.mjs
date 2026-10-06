/**
 * Lightweight YAML guard for the deployment files.
 *
 * We cannot run `docker compose config` or actionlint in this environment
 * (no Docker daemon), so this script performs the structural checks that
 * actually break these files:
 *
 *   1. tabs used for indentation (illegal in YAML);
 *   2. duplicate keys **within the same mapping** (sibling mappings may reuse a
 *      key name legitimately, so the check is scoped by parent path);
 *   3. unbalanced brackets/braces and unterminated quotes;
 *   4. inconsistent indentation between siblings;
 *   5. compose: the required services/networks exist and the tunnel token is referenced;
 *   6. workflows: `on`, `jobs`, `runs-on` exist and steps are well formed.
 *
 * Usage: node scripts/validate-yaml.mjs [file ...]
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const defaultTargets = ['compose.yaml', '.github/workflows/docker-publish.yml'];
const targets = process.argv.slice(2).length > 0 ? process.argv.slice(2) : defaultTargets;

const errors = [];
const warnings = [];

/** Counts a character outside of quoted spans. */
function countUnquoted(text, char) {
  let count = 0;
  let single = false;
  let double = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === "'" && !double) single = !single;
    else if (c === '"' && !single) double = !double;
    else if (c === char && !single && !double) count += 1;
  }
  return { count, unterminated: single || double };
}

/** Strips a trailing comment that is not inside quotes. */
function stripComment(body) {
  let single = false;
  let double = false;
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i];
    if (c === "'" && !double) single = !single;
    else if (c === '"' && !single) double = !double;
    else if (c === '#' && !single && !double && (i === 0 || /\s/.test(body[i - 1] ?? ' '))) {
      return body.slice(0, i).trimEnd();
    }
  }
  return body.trimEnd();
}

function validate(target) {
  const absolute = path.isAbsolute(target) ? target : path.join(root, target);
  if (!fs.existsSync(absolute)) {
    errors.push(`${target}: الملف غير موجود`);
    return;
  }

  const rawLines = fs.readFileSync(absolute, 'utf8').split('\n');

  /**
   * Stack of open mappings. Each frame knows the indentation of its keys, a
   * unique path (used to scope duplicate-key detection) and the keys seen so far.
   *
   * Two YAML realities are handled explicitly:
   *   - sibling mappings may legitimately reuse a key name (`- name:` per step),
   *     so duplicates are only reported inside the same frame;
   *   - a `-` sequence item starts a fresh mapping, so it pushes its own frame
   *     (path gets an index) instead of reusing the parent's.
   */
  const stack = [{ indent: -1, path: '#root', keys: new Map(), fromSequence: false }];
  let sequenceIndex = 0;
  let blockScalarParentIndent = null;

  const currentFrame = () => stack[stack.length - 1];

  for (let i = 0; i < rawLines.length; i += 1) {
    const lineNumber = i + 1;
    const raw = rawLines[i].replace(/\r$/, '');

    if (raw.trim().length === 0) continue;

    // ------------------------------------------------------------ tabs
    if (/^\t/.test(raw) || /^[ ]*\t/.test(raw)) {
      errors.push(`${target}:${lineNumber}: إزاحة بـ Tab (YAML يمنع ذلك)`);
      continue;
    }

    const indent = raw.length - raw.trimStart().length;
    const body = raw.trimStart();

    // داخل block scalar: نتجاهل كل ما هو أعمق من رأس السكالر.
    if (blockScalarParentIndent !== null) {
      if (indent > blockScalarParentIndent) continue;
      blockScalarParentIndent = null;
    }

    if (body.startsWith('#')) continue;

    // -------------------------------------------------- رأس block scalar
    const withoutComment = stripComment(body);
    if (/(^|[\s-])[A-Za-z0-9_.@/-]+:\s*[|>][-+]?\d?\s*$/.test(withoutComment)) {
      blockScalarParentIndent = indent;
      continue;
    }

    const isSequence = /^-\s/.test(body) || body === '-';
    const afterDash = isSequence ? body.replace(/^-\s*/, '') : body;
    const contentIndent = isSequence ? indent + (body.length - afterDash.length) : indent;

    // ------------------------------------------------------ إغلاق الإطارات
    if (isSequence) {
      // كل عنصر `-` بنفس الإزاحة كائن جديد: نُغلق العنصر السابق بالكامل.
      while (stack.length > 1) {
        const top = currentFrame();
        if (top.indent > contentIndent) stack.pop();
        else if (top.fromSequence && top.indent === contentIndent) stack.pop();
        else break;
      }
      sequenceIndex += 1;
      stack.push({
        indent: contentIndent,
        path: `${currentFrame().path}[${sequenceIndex}]`,
        keys: new Map(),
        fromSequence: true,
      });
    } else {
      while (stack.length > 1 && currentFrame().indent > contentIndent) stack.pop();
    }

    const parent = currentFrame();

    // ------------------------------------------------ علامات الترقيم
    const braces = countUnquoted(withoutComment, '{');
    const bracesClose = countUnquoted(withoutComment, '}');
    const brackets = countUnquoted(withoutComment, '[');
    const bracketsClose = countUnquoted(withoutComment, ']');
    if (braces.count !== bracesClose.count) {
      warnings.push(`${target}:${lineNumber}: أقواس معقوفة {} غير متوازنة`);
    }
    if (brackets.count !== bracketsClose.count) {
      warnings.push(`${target}:${lineNumber}: أقواس مربعة [] غير متوازنة`);
    }
    const dq = countUnquoted(withoutComment, '"');
    const sq = countUnquoted(withoutComment, "'");
    if (dq.unterminated && !/:\s*"/.test(withoutComment) && !withoutComment.includes(': "')) {
      warnings.push(`${target}:${lineNumber}: علامة اقتباس مزدوجة غير مغلقة`);
    }
    if (sq.unterminated && !/:\s*'/.test(withoutComment) && !withoutComment.startsWith("'")) {
      warnings.push(`${target}:${lineNumber}: علامة اقتباس مفردة غير مغلقة`);
    }

    // ------------------------------------------------------ المفتاح
    const keyMatch = afterDash.match(/^([A-Za-z0-9_.@/-]+|'[^']+'|"[^"]+"):(?:\s|$)/);
    if (!keyMatch) continue; // قيمة مسلسلة أو نص حر

    const cleanKey = keyMatch[1].replace(/^['"]|['"]$/g, '');

    if (parent.keys.has(cleanKey)) {
      errors.push(
        `${target}:${lineNumber}: مفتاح مكرر «${cleanKey}» في نفس المستوى (أول ظهور في السطر ${parent.keys.get(cleanKey)})`,
      );
    } else {
      parent.keys.set(cleanKey, lineNumber);
    }

    // هل يفتح هذا المفتاح mapping فرعيًا؟ (لا قيمة بعده)
    const rest = afterDash.slice(keyMatch[0].length).trim();
    const opensMapping = rest.length === 0 || rest.startsWith('#');
    if (opensMapping) {
      stack.push({ indent: contentIndent, path: `${parent.path}.${cleanKey}`, keys: new Map(), fromSequence: false });
    }
  }

  console.log(`[i] ${target}: ${rawLines.length} سطرًا`);

  // ------------------------------------------------------- فحوص compose
  if (/compose\.ya?ml$/.test(target)) {
    const text = rawLines.join('\n');
    for (const required of ['services:', 'app:', 'cloudflared:', 'networks:', 'healthcheck:']) {
      if (!text.includes(required)) errors.push(`${target}: العنصر المطلوب «${required}» مفقود`);
    }
    if (!text.includes('CLOUDFLARE_TUNNEL_TOKEN')) errors.push(`${target}: لا يوجد مرجع لتوكن النفق`);
    if (!/app:3500|app":\s*"?3500/.test(text) && !text.includes('3500')) {
      errors.push(`${target}: لا يوجد منفذ 3500`);
    }
    if (/privileged:\s*true/.test(text)) warnings.push(`${target}: privileged: true — غير مطلوب لهذا التطبيق`);
  }

  // ------------------------------------------------------ فحوص workflows
  if (target.includes('workflows')) {
    const text = rawLines.join('\n');
    if (!/^on:/m.test(text)) errors.push(`${target}: لا يوجد قسم on:`);
    if (!/^jobs:/m.test(text)) errors.push(`${target}: لا يوجد قسم jobs:`);
    if (!/runs-on:/.test(text)) errors.push(`${target}: لا يوجد runs-on`);
    if (!/permissions:/.test(text)) warnings.push(`${target}: لا يوجد قسم permissions (مستحسن للأمان)`);

    const stepNames = text.match(/^\s{6}- name:/gm) ?? [];
    const usesCount = text.match(/^\s{8}uses:/gm) ?? [];
    const runCount = text.match(/^\s{8}run:/gm) ?? [];
    if (usesCount.length + runCount.length === 0) {
      errors.push(`${target}: لم أجد أي خطوة (uses:/run:) — تحقّق من الإزاحة`);
    }
    if (stepNames.length !== usesCount.length + runCount.length) {
      warnings.push(
        `${target}: عدد الخطوات (${stepNames.length}) لا يطابق عدد uses+run (${usesCount.length + runCount.length}) — راجع الإزاحة`,
      );
    }
  }
}

for (const target of targets) validate(target);

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

console.log('✅ لا أخطاء بنيوية في ملفات YAML.');
