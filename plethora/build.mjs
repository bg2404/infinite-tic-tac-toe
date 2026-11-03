// Builds the Plethora Bit's single classic script, plethora/dist/main.js.
//
//   node plethora/build.mjs
//
// Concatenates src/engine.mjs, src/ai.mjs and src/bit.mjs (in that order; a
// missing bit.mjs is skipped with a warning) into one IIFE in strict mode, so
// the sources share one scope and nothing leaks to globals. Per line, the
// transform drops lines that start with `import ` (a multi-line
// `import { ... } from '...'` is dropped through its `from` line), strips a
// leading `export default ` or `export `, and keeps everything else
// byte-for-byte.
//
// Rules for the sources this implies:
//  - Imports start at column 0; a multi-line import may hold only specifiers
//    (names, commas, braces, `as`) between its first line and its `from` line.
//  - Top-level names must be unique across all sources. Inside one function
//    scope a repeated `function` declaration is not a syntax error, the later
//    one silently wins, so the build checks for repeats itself.
//
// Exits 1 if a check fails: the rules above, `node --check`, compiling the
// output as a classic script (`node --check` alone would accept leftover
// import/export syntax, because Node detects module syntax in .js files), or
// the platform's 2 MB size limit.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = dirname(fileURLToPath(import.meta.url)); // plethora/
const SOURCES = ['src/engine.mjs', 'src/ai.mjs', 'src/bit.mjs'];
const OPTIONAL = new Set(['src/bit.mjs']);
const OUT = join(ROOT, 'dist', 'main.js');
const HEADER =
  '// Plethora Bit · docs and draft upload: https://agent.plethora.studio/v1/agent/start.md';
const SIZE_LIMIT = 2 * 1024 * 1024;

/** A complete one-line import: `import 'x'` or `import ... from 'x'`. */
const SINGLE_LINE_IMPORT = /^import\s*(?:[^'"]*\bfrom\s*)?(['"])[^'"]*\1/;
/** The closing line of a multi-line import, e.g. `} from './engine.mjs';`. */
const IMPORT_FROM_LINE = /^[\s\w$,{}*]*\bfrom\s*(['"])[^'"]*\1\s*;?\s*$/;
/** A line inside a multi-line import's specifier list. */
const IMPORT_SPECIFIER_LINE = /^[\s\w$,{}*]*$/;
/** A top-level declaration at column 0, with any export prefix. */
const TOP_LEVEL_DECL =
  /^(?:export\s+(?:default\s+)?)?(?:(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|(?:const|let|var|class)\s+([A-Za-z_$][\w$]*))/;

const errors = [];
const outRel = relative(process.cwd(), OUT) || OUT;

function transform(text, file, declared) {
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop(); // the file's final newline
  const kept = [];
  let importOpenedAt = null; // inside a multi-line import that started here
  lines.forEach((line, index) => {
    const where = `${file}:${index + 1}`;
    if (importOpenedAt) {
      if (IMPORT_FROM_LINE.test(line)) importOpenedAt = null;
      else if (!IMPORT_SPECIFIER_LINE.test(line)) {
        errors.push(`${where}: unexpected text inside the import opened at ${importOpenedAt}`);
        importOpenedAt = null;
      }
      return;
    }
    const decl = TOP_LEVEL_DECL.exec(line);
    if (decl) {
      const name = decl[1] ?? decl[2];
      if (declared.has(name)) {
        errors.push(`${where}: top-level name '${name}' is already declared at ${declared.get(name)}`);
      } else {
        declared.set(name, where);
      }
    }
    if (line.startsWith('import ')) {
      if (!SINGLE_LINE_IMPORT.test(line)) {
        if (IMPORT_SPECIFIER_LINE.test(line.slice('import '.length))) importOpenedAt = where;
        else errors.push(`${where}: cannot find where this import ends`);
      }
      return;
    }
    if (line.startsWith('export default ')) kept.push(line.slice('export default '.length));
    else if (line.startsWith('export ')) kept.push(line.slice('export '.length));
    else kept.push(line);
  });
  if (importOpenedAt) errors.push(`${file}: the import opened at ${importOpenedAt} never reaches its 'from' line`);
  return kept;
}

const out = [HEADER, '(() => {', '"use strict";'];
const declared = new Map();
for (const file of SOURCES) {
  const path = join(ROOT, file);
  if (!existsSync(path)) {
    if (OPTIONAL.has(file)) {
      console.warn(`warning: ${relative(process.cwd(), path)} not found, skipping it`);
      continue;
    }
    errors.push(`${file}: required source is missing`);
    continue;
  }
  out.push(`// ---- ${file} ----`, ...transform(readFileSync(path, 'utf8'), file, declared));
}
out.push('})();');

if (errors.length === 0) {
  const code = `${out.join('\n')}\n`;
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, code, 'utf8');

  const check = spawnSync(process.execPath, ['--check', OUT], { stdio: 'inherit' });
  if (check.status !== 0) errors.push(`node --check ${outRel} failed`);

  try {
    new vm.Script(code, { filename: OUT });
  } catch (err) {
    errors.push(`${outRel} does not compile as a classic script: ${err.message}`);
  }

  const bytes = Buffer.byteLength(code, 'utf8');
  console.log(`${outRel}: ${bytes} bytes (${(bytes / 1024).toFixed(1)} KB; platform limit 2 MB)`);
  if (bytes > SIZE_LIMIT) errors.push(`${outRel} is over the 2 MB platform limit`);
}

if (errors.length > 0) {
  for (const error of errors) console.error(`error: ${error}`);
  process.exit(1);
}
console.log('build ok');
