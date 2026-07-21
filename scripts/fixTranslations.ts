// @ts-nocheck
/**
 * Repair broken translations for a SINGLE target locale.
 *
 * Lingo's normal sync (scripts/syncAllLanguages.ts) tolerates partial failures
 * (`allowNonZeroExit`) and never retries them, and because i18n.lock is keyed by
 * source-content checksum, a page that failed once (left as English passthrough)
 * is considered "done" and skipped forever. This script closes that gap for one
 * locale at a time:
 *
 *   1) Detect pages that are missing OR still English passthrough in the target
 *      locale (native-script ratio too low).
 *   2) Move English content into /en and rename the locale folder to its Lingo
 *      code (e.g. cn -> zh-CN), matching the i18n.json bucket layout.
 *   3) Force-retranslate ONLY the broken files for ONLY that locale:
 *        lingo.dev run --target-locale <code> --force --file <each> --concurrency N
 *   4) Rename back, run the standard MDX repair, re-detect, and retry (max N).
 *   5) Move English back and report any pages still untranslated.
 *
 * Usage:
 *   node scripts/fixTranslations.ts --locale zh-CN
 *   node scripts/fixTranslations.ts --locale zh-CN --detect-only   # list, no changes
 *   node scripts/fixTranslations.ts --locale zh-CN --skip-lingo    # plumbing test
 *   node scripts/fixTranslations.ts --locale zh-CN --concurrency 8 --max-attempts 2
 *
 * Written CommonJS-style so Node can run the .ts file directly (see AGENTS.md).
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  restoreLockedPatterns,
  repairBrokenCodeFences,
  repairHtmlComments,
  repairLiteralNewlines,
  restoreEnglishFrontmatterDirectives,
  validateAndReplace,
} = require('./validateAndRepairTranslations.ts');

const ROOT = path.join(__dirname, '..');
const EN_FOLDER = path.join(ROOT, 'en');
const I18N_PATH = path.join(ROOT, 'i18n.json');

// Only locales whose Mintlify folder name differs from the Lingo code.
const LINGO_TO_MINTLIFY = { 'zh-CN': 'cn' };
const toMintlify = (code) => LINGO_TO_MINTLIFY[code] || code;

// Kept in sync with scripts/syncAllLanguages.ts
const FOLDERS_TO_MOVE = [
  'api-reference', 'changelog', 'community', 'developer-resources',
  'features', 'guides', 'integrations', 'miscellaneous', 'snippets',
];
const FILES_TO_MOVE = [
  'development.mdx', 'introduction.mdx', 'migrate-to-dodo.mdx', 'quickstart.mdx', 'welcome.mdx',
];
// Content dirs that hold translatable pages (root files handled separately).
const CONTENT_DIRS = [
  'features', 'developer-resources', 'api-reference',
  'integrations', 'changelog', 'miscellaneous', 'community',
];
const ROOT_FILES = ['introduction.mdx', 'migrate-to-dodo.mdx'];
// Locked from translation in i18n.json — never treat these as "broken".
const EXCLUDED = new Set([
  'miscellaneous/faq.mdx',
  'miscellaneous/merchant-acceptance.mdx',
  'miscellaneous/list-of-countries-we-accept-payments-from.mdx',
]);

// Native-script character ranges used to tell a real translation from an
// English passthrough. Only defined for scripts we can detect reliably.
const SCRIPT_RANGES = {
  cn: /[\u4e00-\u9fff]/g,
  ja: /[\u3040-\u30ff\u4e00-\u9fff]/g,
  ko: /[\uac00-\ud7a3]/g,
  ar: /[\u0600-\u06ff]/g,
  hi: /[\u0900-\u097f]/g,
};

function getAllMdx(dir, base, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) getAllMdx(full, base, out);
    else if (entry.name.endsWith('.mdx')) out.push(path.relative(base, full));
  }
  return out;
}

// Strip frontmatter, code, JSX tags and URLs so we only weigh prose. The output
// is used solely for character-ratio counting, never rendered.
function bodyProse(filePath) {
  let t = fs.readFileSync(filePath, 'utf8');
  t = t.replace(/^---[\s\S]*?---/, '');
  t = t.replace(/```[\s\S]*?```/g, '');
  t = t.replace(/`[^`]*`/g, '');
  // Loop to a fixpoint, then drop any leftover angle brackets. A single pass can
  // leave a bracket behind for nested input like "<a<b>c>"; looping until stable
  // and stripping stray "<"/">" guarantees no "<tag" survives (CodeQL
  // incomplete-sanitization). The string strictly shrinks, so the loop ends.
  let prev;
  do {
    prev = t;
    t = t.replace(/<[^>]+>/g, '');
  } while (t !== prev);
  t = t.replace(/[<>]/g, '');
  t = t.replace(/https?:\/\/\S+/g, '');
  return t;
}

// Set of English pages that SHOULD have a translation (minus excluded).
function expectedPages(srcBase) {
  const set = new Set();
  for (const d of CONTENT_DIRS) {
    for (const rel of getAllMdx(path.join(srcBase, d), srcBase)) set.add(rel);
  }
  for (const f of ROOT_FILES) {
    if (fs.existsSync(path.join(srcBase, f))) set.add(f);
  }
  for (const x of EXCLUDED) set.delete(x);
  return set;
}

// A page is "broken" when the target file is missing, or its prose is
// overwhelmingly Latin with little/no native script (i.e. never translated).
function detectBroken(lingoCode, expected) {
  const mint = toMintlify(lingoCode);
  const langDir = path.join(ROOT, mint);
  const range = SCRIPT_RANGES[mint];
  const broken = [];
  for (const rel of expected) {
    const p = path.join(langDir, rel);
    if (!fs.existsSync(p)) { broken.push(rel); continue; }
    const prose = bodyProse(p);
    if (prose.trim().length < 150) continue; // API stubs / near-empty pages
    const latin = (prose.match(/[A-Za-z]/g) || []).length;
    if (!range) continue; // can't reliably score this script; skip
    const native = (prose.match(range) || []).length;
    const ratio = (native + latin) > 0 ? native / (native + latin) : 1;
    if ((native < 5 && latin > 100) || (ratio < 0.25 && latin > 150)) broken.push(rel);
  }
  return broken.sort();
}

function moveToEn() {
  if (!fs.existsSync(EN_FOLDER)) fs.mkdirSync(EN_FOLDER, { recursive: true });
  for (const f of [...FOLDERS_TO_MOVE, ...FILES_TO_MOVE]) {
    const src = path.join(ROOT, f);
    if (fs.existsSync(src)) fs.renameSync(src, path.join(EN_FOLDER, f));
  }
}

function moveBackFromEn() {
  for (const f of [...FOLDERS_TO_MOVE, ...FILES_TO_MOVE]) {
    const src = path.join(EN_FOLDER, f);
    if (fs.existsSync(src)) fs.renameSync(src, path.join(ROOT, f));
  }
  try {
    if (fs.readdirSync(EN_FOLDER).length === 0) fs.rmdirSync(EN_FOLDER);
  } catch { /* leave non-empty en/ in place for inspection */ }
}

function renameDir(from, to) {
  const src = path.join(ROOT, from);
  const dst = path.join(ROOT, to);
  if (!fs.existsSync(src)) return;
  if (fs.existsSync(dst)) fs.rmSync(dst, { recursive: true, force: true });
  fs.renameSync(src, dst);
}

// Lingo's --file is a substring match, so a bare filter like "introduction.mdx"
// also hits "api-reference/introduction.mdx", "mor-introduction.mdx", etc. Read
// the target files that a filter would collaterally match but that we are NOT
// fixing, so we can restore them verbatim after the run and keep the change set
// to exactly the intended pages.
function snapshotCollateral(targets, expected, mint) {
  const targetSet = new Set(targets);
  const snap = new Map();
  for (const rel of expected) {
    if (targetSet.has(rel)) continue;
    if (!targets.some((t) => rel.includes(t))) continue;
    const fp = path.join(ROOT, mint, rel);
    if (fs.existsSync(fp)) snap.set(fp, fs.readFileSync(fp));
  }
  if (snap.size) console.log(`[guard] protecting ${snap.size} over-matched file(s) from --file collateral`);
  return snap;
}

function restoreCollateral(snap) {
  for (const [fp, buf] of snap) fs.writeFileSync(fp, buf);
}

function runLingo(lingoCode, files, concurrency) {
  const args = [
    '--yes', 'lingo.dev@latest', 'run',
    '--target-locale', lingoCode,
    '--force',
    '--concurrency', String(concurrency),
  ];
  for (const f of files) args.push('--file', f);
  console.log(`[lingo] npx ${args.join(' ')}`);
  const res = spawnSync('npx', args, { cwd: ROOT, stdio: 'inherit', shell: false });
  if (res.error) throw res.error;
  if (typeof res.status === 'number' && res.status !== 0) {
    console.warn(`[warn] lingo exited with status ${res.status} — some files may still be untranslated.`);
  }
  return res.status || 0;
}

function repairLang(mint) {
  restoreLockedPatterns([mint], false);
  repairBrokenCodeFences([mint], false);
  repairHtmlComments([mint], false);
  repairLiteralNewlines([mint], false);
  restoreEnglishFrontmatterDirectives([mint], false);
  validateAndReplace([mint], false);
}

function getArg(argv, name, def) {
  const a = argv.find((x) => x === name || x.startsWith(name + '='));
  if (!a) return def;
  return a.includes('=') ? a.split('=')[1] : argv[argv.indexOf(a) + 1];
}

function intArg(argv, name, def) {
  const n = parseInt(getArg(argv, name, String(def)), 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}

function validateLocale(lingoCode) {
  if (!fs.existsSync(I18N_PATH)) return;
  const cfg = JSON.parse(fs.readFileSync(I18N_PATH, 'utf8'));
  const targets = cfg?.locale?.targets || [];
  if (!targets.includes(lingoCode)) {
    console.warn(`[warn] "${lingoCode}" is not a target in i18n.json (${targets.join(', ')}).`);
  }
}

function main() {
  const argv = process.argv.slice(2);
  const locale = getArg(argv, '--locale', 'zh-CN');
  const mint = toMintlify(locale);
  const detectOnly = argv.includes('--detect-only');
  const skipLingo = argv.includes('--skip-lingo');
  const maxAttempts = intArg(argv, '--max-attempts', 3);
  const concurrency = intArg(argv, '--concurrency', 8);

  validateLocale(locale);

  if (!SCRIPT_RANGES[mint]) {
    console.error(`[error] No passthrough detector for "${mint}". Supported: ${Object.keys(SCRIPT_RANGES).join(', ')}.`);
    process.exitCode = 1;
    return;
  }

  const expected = expectedPages(ROOT);
  let broken = detectBroken(locale, expected);
  const initialCount = broken.length;
  console.log(`\n[detect] ${mint}: ${broken.length} broken (passthrough/missing) of ${expected.size} translatable pages`);
  broken.forEach((b) => console.log(`   - ${b}`));

  if (detectOnly) return;
  if (broken.length === 0) { console.log('[done] Nothing to fix.'); return; }

  for (let attempt = 1; attempt <= maxAttempts && broken.length; attempt++) {
    console.log(`\n=== Attempt ${attempt}/${maxAttempts}: retranslating ${broken.length} file(s) into ${locale} ===`);
    const collateral = snapshotCollateral(broken, expected, mint);
    moveToEn();
    try {
      renameDir(mint, locale); // cn -> zh-CN so Lingo can find the target
      try {
        if (skipLingo) console.log('[skip-lingo] skipping actual translation call');
        else runLingo(locale, broken, concurrency);
      } finally {
        renameDir(locale, mint); // zh-CN -> cn for Mintlify
      }
    } finally {
      moveBackFromEn();
    }
    restoreCollateral(collateral);
    // Repair runs each pass with English back at ROOT (enSourcePath resolves).
    // A page lingo translated but left as invalid MDX is reverted to English
    // here, which re-detects as passthrough below and is retried next pass
    // instead of being silently lost.
    if (!skipLingo) repairLang(mint);
    broken = detectBroken(locale, expected);
    console.log(`[verify] after attempt ${attempt}: ${broken.length} still broken`);
    if (skipLingo) break; // plumbing test: don't loop
  }

  const fixedCount = initialCount - broken.length;

  if (broken.length === 0) {
    console.log(`\n[result] All ${mint} pages are translated (fixed ${fixedCount}/${initialCount}).`);
    return;
  }

  console.log(`\n[result] Fixed ${fixedCount}/${initialCount}. ${broken.length} ${mint} page(s) still untranslated:`);
  broken.forEach((b) => console.log(`   - ${b}`));

  // Fail only on ZERO progress. Partial progress exits 0 so the pages that were
  // fixed still reach a PR (the workflow opens one from `git status`); the list
  // above is the record of what still needs another pass.
  if (fixedCount <= 0 && !skipLingo) process.exitCode = 1;
}

if (require.main === module) main();
