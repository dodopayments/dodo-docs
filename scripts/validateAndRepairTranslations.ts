// @ts-nocheck
/**
 * Post-translation validation & repair.
 *
 * Run this after lingo.dev to fix the most common translation defects:
 *
 *   1. **Un-restored locked patterns** — lingo.dev replaces JSX component tags
 *      with `{/* LOCKED_PATTERN_<hash> *​/}` placeholders before handing content
 *      to the AI.  Sometimes the restore step fails silently, leaving broken MDX.
 *      This script rebuilds a hash→tag mapping from the English source and
 *      restores every placeholder.
 *
 *   2. **Broken code fences** — the AI translator occasionally splits fenced code
 *      block openings like ```typescript into ``` on one line and `typescript` on
 *      the next.  MDX then tries to parse `{ ... }` in the code as JSX expressions,
 *      causing "Could not parse expression with acorn" errors.
 *
 *   2b. **HTML-style comments wrapping JSX** — the AI translator sometimes emits
 *      `<!-- <Frame> -->` instead of restoring the original tag, which both
 *      invalidates MDX (`<!` is rejected) and silently drops the wrapped JSX.
 *      We convert each `<!-- X -->` outside code blocks to either the bare JSX
 *      it likely was (when X is a single Mintlify tag) or to an MDX comment
 *      `{/* X *​/}` (both accepted by Mintlify).
 *
 *   3. **Structurally corrupted files** — the AI translator occasionally breaks
 *      tag nesting (mismatched open/close, deleted tags, duplicated sections).
 *      Files that still fail MDX compilation after steps 1–2b are replaced with
 *      the English source so the site always builds.  They will be re-translated
 *      on the next sync run.
 *
 * Usage:
 *   node scripts/validateAndRepairTranslations.ts                # run repairs
 *   node scripts/validateAndRepairTranslations.ts --dry-run      # preview only
 *   node scripts/validateAndRepairTranslations.ts --langs ar,es  # specific languages
 *   node scripts/validateAndRepairTranslations.ts --self-test    # run unit tests
 *
 * This script is also called automatically by syncAllLanguages.ts.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Same regex from i18n.json lockedPatterns — matches ALL Mintlify component tags
const TAG_RE_SRC =
  '<\\/?(?:Note|Tip|Warning|Info|Check|Steps|Step|Tabs|Tab|CodeGroup|Card|CardGroup|Accordion|AccordionGroup|Frame|Expandable|ResponseField|ParamField|RequestExample|ResponseExample|Tooltip|Update|Snippet|Icon)(?:\\s[^>]*)?\\/?>'; // single-line
const TAG_RE = new RegExp(TAG_RE_SRC, 'g');

// Locked-pattern placeholder left by lingo.dev. Several variants are seen in
// the wild:
//   1. Canonical JSX-comment form `{/* LOCKED_PATTERN_... */}`
//   2. "Naked" `/* LOCKED_PATTERN_... */` form (translator stripped `{}`)
//   3. Asterisk-stripped form `{/ LOCKED_PATTERN_... /}` (translator deleted `*`)
//   4. Fully bare form `LOCKED_PATTERN_<hash>` with no wrappers at all
// All four leak through as visible junk text in the rendered output if not
// restored. The regex below tolerates whitespace/`!` decorators between the
// hash and the (optional) comment delimiters.
const LOCKED_HASH_SRC = 'LOCKED_PATTERN_([a-f0-9]+)';
const LOCKED_RE = new RegExp(
  // Variant A: `{/* ... */}`, `/* ... */`, `{/ ... /}`, or `{... }` style
  `\\{?\\/\\*?[!\\s]*${LOCKED_HASH_SRC}[!\\s]*\\*?\\/\\}?` +
    // Variant B (alternation): completely bare hash (no surrounding delimiters)
    `|${LOCKED_HASH_SRC}`,
  'g',
);

const ITEM_RE = new RegExp(
  `(${TAG_RE_SRC})|(\\{?\\/\\*?[!\\s]*LOCKED_PATTERN_[a-f0-9]+[!\\s]*\\*?\\/\\}?|LOCKED_PATTERN_[a-f0-9]+)`,
  'g',
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function walkMdx(dir, list) {
  list = list || [];
  if (!fs.existsSync(dir)) return list;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkMdx(full, list);
    else if (entry.name.endsWith('.mdx')) list.push(full);
  }
  return list;
}

/** ar/features/foo.mdx → features/foo.mdx (absolute) */
function enSourcePath(translatedFile) {
  const rel = path.relative(ROOT, translatedFile);
  const parts = rel.split(path.sep);
  parts.shift(); // drop language prefix
  return path.join(ROOT, ...parts);
}

function extractTags(content) {
  return [...content.matchAll(TAG_RE)].map((m) => m[0]);
}

function extractItems(content) {
  return [...content.matchAll(ITEM_RE)].map((m) => {
    if (m[1]) return { type: 'tag', value: m[1] };
    const hash = m[2].match(/LOCKED_PATTERN_([a-f0-9]+)/)[1];
    return { type: 'locked', value: m[2], hash: hash };
  });
}

// Strip frontmatter, fenced code blocks, and inline backtick code from an MDX
// document so syntax checks operate only on prose + JSX.
//
// Fence stripping is line-based and tolerant of indent mismatches between the
// opening and closing fences — docs nest fences inside `<Step>` / `<Tab>` and
// the closing fence is sometimes dedented to column 0. State-machine logic:
//   * see a fence line          → toggle inFence
//   * inFence == true           → drop the line
//   * inFence == false but fence→ drop the fence line itself
//
// A "fence line" is any line whose first non-whitespace characters are ```.
function stripCodeAndFrontmatter(content) {
  let s = content.replace(/^---[\s\S]*?---/, '');

  const lines = s.split('\n');
  const out = [];
  let inFence = false;
  for (const line of lines) {
    const isFence = /^[ \t]*```/.test(line);
    if (isFence) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    out.push(line);
  }
  s = out.join('\n');

  // Strip inline backtick code. Single-line only so real JSX is preserved.
  s = s.replace(/`[^`\n]+`/g, '');

  return s;
}

const COMPONENT_NAMES =
  'Note|Tip|Warning|Info|Check|Steps|Step|Tabs|Tab|CodeGroup|Card|CardGroup|Accordion|AccordionGroup|Frame|Expandable|ResponseField|ParamField|RequestExample|ResponseExample|Tooltip|Update|Snippet|Icon';

/** Lightweight MDX syntax validation (no dependencies). */
function validateMdx(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const stripped = content.replace(/^---[\s\S]*?---/, '');

  if (/LOCKED_PATTERN_[a-f0-9]+/.test(stripped)) {
    return 'Contains un-restored LOCKED_PATTERN placeholders';
  }

  // Broken code fences: ```\n\n<lang> or ```\n<lang> outside a valid block.
  // This pattern causes "Could not parse expression with acorn" errors.
  const brokenFenceRe = /^```[ \t]*\n(?:\n)?(?:typescript|javascript|json|bash|python|tsx|jsx|css|html|yaml|toml|shell|sh|sql|go|rust|ruby|php|csharp|java|kotlin|swift|xml|diff|text|plaintext|curl|powershell)[ \t]*$/m;
  if (brokenFenceRe.test(stripped)) {
    return 'Contains broken code fence (split language identifier)';
  }

  // All subsequent checks operate on prose + JSX only (no code).
  const outsideCode = stripCodeAndFrontmatter(content);

  // HTML-style comments are not valid in MDX (`<!-- foo -->` must be `{/* foo */}`).
  // Translator sometimes wraps JSX tags in `<!-- -->` which both invalidates the
  // file and silently drops the wrapped component from rendered output.
  if (/<!--/.test(outsideCode)) {
    return 'Contains HTML-style comment (`<!-- -->`), not valid in MDX';
  }

  // Stray `<!` at start of a tag (e.g., DOCTYPE leaks). MDX rejects `<!`.
  if (/<![A-Za-z]/.test(outsideCode)) {
    return 'Contains stray `<!` (DOCTYPE or similar), not valid in MDX';
  }

  // Tag-stack walker for known Mintlify components. Catches translator-induced
  // structural bugs (mismatched, orphan, or unclosed tags) without a real MDX
  // compiler. Self-closing tags are skipped.
  const tagStack = [];
  const tagRe = new RegExp(
    `<(\\/?)(?:${COMPONENT_NAMES})(\\s[^>]*)?\\/?>`,
    'g',
  );
  let m;
  while ((m = tagRe.exec(outsideCode)) !== null) {
    const fullTag = m[0];
    const isClosing = m[1] === '/';
    const isSelfClosing = fullTag.endsWith('/>');

    if (isSelfClosing && !isClosing) continue;

    const nameMatch = fullTag.match(/^<\/?([A-Z][a-zA-Z]*)/);
    if (!nameMatch) continue;
    const name = nameMatch[1];

    if (isClosing) {
      if (tagStack.length === 0) {
        return `Closing </${name}> with no matching open tag`;
      }
      const top = tagStack[tagStack.length - 1];
      if (top !== name) {
        return `Mismatched tags: expected </${top}> but found </${name}>`;
      }
      tagStack.pop();
    } else {
      tagStack.push(name);
    }
  }

  if (tagStack.length > 0) {
    return `Unclosed tag(s): ${tagStack.join(', ')}`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Phase 1: Restore LOCKED_PATTERN placeholders
// ---------------------------------------------------------------------------

/**
 * Align translated items with English tags.
 *
 * Uses a sequential walk with small look-ahead for minor drift, but never
 * pollutes a global map with bad alignments from one broken file.
 *
 * Returns a Map<hash, tag> of per-file confident mappings (one mapping per
 * hash; if a hash appears multiple times in the file it always maps to the
 * same tag because locked hashes are content-addressed).
 */
function alignFileLocked(enTags, trItems) {
  const localMap = new Map(); // hash → tag (for this file only)
  let ei = 0;
  for (const item of trItems) {
    if (ei >= enTags.length) break;

    if (item.type === 'tag') {
      if (item.value === enTags[ei]) {
        ei++;
      } else {
        // Look ahead up to 3 positions for a match. If none found we do NOT
        // advance ei — the translated file has an extra/spurious tag.
        for (let k = 1; k <= 3 && ei + k < enTags.length; k++) {
          if (item.value === enTags[ei + k]) {
            ei = ei + k + 1;
            break;
          }
        }
      }
    } else {
      // LOCKED_PATTERN → map to current English tag
      const tag = enTags[ei];
      if (tag) {
        // All occurrences of a hash in this file must resolve to the same
        // tag (locked hashes are content-addressed, so this is guaranteed
        // upstream). If a local mismatch is observed, bail on the earlier
        // mapping — trust the later alignment since we've walked further.
        localMap.set(item.hash, tag);
        ei++;
      }
    }
  }
  return localMap;
}

function restoreLockedPatterns(langDirs, dryRun) {
  console.log('\n[repair:locked-patterns] Restoring locked patterns per-file...');

  // Collect all translated files that contain locked patterns.
  const transFiles = [];
  for (const lang of langDirs) {
    const langDir = path.join(ROOT, lang);
    for (const f of walkMdx(langDir)) {
      const content = fs.readFileSync(f, 'utf8');
      const count = [...content.matchAll(LOCKED_RE)].length;
      if (count > 0) transFiles.push({ path: f, count: count });
    }
  }

  if (transFiles.length === 0) {
    console.log('  No locked patterns found — nothing to restore.');
    return;
  }

  // ---------------------------------------------------------------------
  // Phase A: Per-file alignment. Each file produces its own hash → tag map
  // derived solely from its own English source. This prevents a misaligned
  // file from corrupting the restoration of *other* files.
  // ---------------------------------------------------------------------
  const perFileMaps = []; // [{ tf, localMap }]
  const voteCounts = new Map(); // hash → Map<tag, count> across files

  for (const { path: tf } of transFiles) {
    const enPath = enSourcePath(tf);
    if (!fs.existsSync(enPath)) continue;

    const enTags = extractTags(fs.readFileSync(enPath, 'utf8'));
    const trItems = extractItems(fs.readFileSync(tf, 'utf8'));
    const localMap = alignFileLocked(enTags, trItems);
    perFileMaps.push({ tf, localMap });

    for (const [hash, tag] of localMap) {
      if (!voteCounts.has(hash)) voteCounts.set(hash, new Map());
      const tagCounts = voteCounts.get(hash);
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }

  // ---------------------------------------------------------------------
  // Phase B: Build a consensus map across files. For each hash, pick the
  // tag that appears in the most per-file alignments. This provides a safe
  // fallback for files whose local alignment failed completely (e.g. the
  // translator deleted most of the structure).
  // ---------------------------------------------------------------------
  const consensusMap = new Map();
  for (const [hash, tagCounts] of voteCounts) {
    let bestTag = null;
    let bestCount = 0;
    for (const [tag, count] of tagCounts) {
      if (count > bestCount) { bestTag = tag; bestCount = count; }
    }
    if (bestTag) consensusMap.set(hash, bestTag);
  }

  console.log(`  Aligned ${perFileMaps.length} files; ${consensusMap.size} unique hashes in consensus map`);

  // ---------------------------------------------------------------------
  // Phase C: Apply replacements. Prefer the local per-file mapping; fall
  // back to the cross-file consensus when the local map has no entry.
  // ---------------------------------------------------------------------
  let filesFixed = 0;
  let totalReplacements = 0;
  let unresolved = 0;

  for (const { tf, localMap } of perFileMaps) {
    let content = fs.readFileSync(tf, 'utf8');
    let replaced = 0;

    content = content.replace(LOCKED_RE, (full, hashA, hashB) => {
      const hash = hashA || hashB;
      const tag = localMap.get(hash) || consensusMap.get(hash);
      if (tag) { replaced++; return tag; }
      unresolved++;
      return full;
    });

    if (replaced > 0) {
      if (!dryRun) fs.writeFileSync(tf, content, 'utf8');
      filesFixed++;
      totalReplacements += replaced;
    }
  }

  console.log(`  Restored ${totalReplacements} patterns in ${filesFixed} files${unresolved ? ` (${unresolved} still unresolved)` : ''}`);
}

// ---------------------------------------------------------------------------
// Phase 2: Repair broken code fences
// ---------------------------------------------------------------------------

// Common code fence languages used across the docs
const FENCE_LANGS = [
  'typescript', 'javascript', 'json', 'bash', 'python', 'tsx', 'jsx',
  'css', 'html', 'yaml', 'toml', 'shell', 'sh', 'sql', 'go', 'rust',
  'ruby', 'php', 'csharp', 'java', 'kotlin', 'swift', 'xml', 'diff',
  'text', 'plaintext', 'curl', 'powershell',
];

// Matches: ```<newline><optional blank line><language><newline>
// Captures the language so we can rejoin it with the fence
const BROKEN_FENCE_RE = new RegExp(
  '```[ \\t]*\\n(?:\\n)?(' + FENCE_LANGS.join('|') + ')[ \\t]*\\n',
  'g',
);

function repairBrokenCodeFences(langDirs, dryRun) {
  console.log('\n[repair:code-fences] Scanning for broken code fence openings...');

  let filesFixed = 0;
  let totalFixes = 0;

  for (const lang of langDirs) {
    const langDir = path.join(ROOT, lang);

    for (const f of walkMdx(langDir)) {
      let content = fs.readFileSync(f, 'utf8');
      let fixes = 0;

      content = content.replace(BROKEN_FENCE_RE, (full, lang) => {
        fixes++;
        return '```' + lang + '\n';
      });

      if (fixes > 0) {
        if (!dryRun) fs.writeFileSync(f, content, 'utf8');
        filesFixed++;
        totalFixes += fixes;
      }
    }
  }

  if (totalFixes === 0) {
    console.log('  No broken code fences found.');
  } else {
    console.log(`  Fixed ${totalFixes} broken fence(s) in ${filesFixed} file(s)`);
  }
}

// ---------------------------------------------------------------------------
// Phase 2b: Convert HTML comments to MDX comments
// ---------------------------------------------------------------------------

// Translator sometimes wraps JSX tags in `<!-- ... -->` instead of restoring
// them. MDX rejects HTML comments outright, producing
//   "Unexpected closing slash `/` in tag, expected an open tag first"
// at the `</...-->` boundary. Convert each `<!-- X -->` outside code blocks to
// the wrapped JSX it likely was (when X is a single Mintlify tag) or to an
// MDX comment `{/* X */}` otherwise — both forms are accepted by Mintlify.
function repairHtmlComments(langDirs, dryRun) {
  console.log('\n[repair:html-comments] Scanning for HTML-style comments...');

  let filesFixed = 0;
  let totalFixes = 0;

  const singleTagRe = new RegExp(`^<\\/?(?:${COMPONENT_NAMES})(?:\\s[^>]*)?\\/?>$`);

  for (const lang of langDirs) {
    const langDir = path.join(ROOT, lang);

    for (const f of walkMdx(langDir)) {
      const original = fs.readFileSync(f, 'utf8');
      let fixes = 0;

      // Split file into "fence" and "non-fence" chunks so HTML-comment
      // replacement only touches non-fence regions. This is more robust than
      // line-by-line because multi-line HTML comments span newlines.
      const lines = original.split('\n');
      const chunks = []; // [{ inFence, text }]
      let buf = [];
      let inFence = false;
      for (const line of lines) {
        if (/^[ \t]*```/.test(line)) {
          if (buf.length) chunks.push({ inFence, text: buf.join('\n') });
          chunks.push({ inFence: true, text: line });
          buf = [];
          inFence = !inFence;
          continue;
        }
        buf.push(line);
      }
      if (buf.length) chunks.push({ inFence, text: buf.join('\n') });

      const repairedChunks = chunks.map((ch) => {
        if (ch.inFence) return ch.text;
        return ch.text.replace(/<!--([\s\S]*?)-->/g, (full, inner) => {
          fixes++;
          const trimmed = inner.trim();
          if (singleTagRe.test(trimmed)) return trimmed;
          return `{/*${inner}*/}`;
        });
      });

      if (fixes > 0) {
        if (!dryRun) fs.writeFileSync(f, repairedChunks.join('\n'), 'utf8');
        filesFixed++;
        totalFixes += fixes;
      }
    }
  }

  if (totalFixes === 0) {
    console.log('  No HTML comments found.');
  } else {
    console.log(`  Converted ${totalFixes} HTML comment(s) in ${filesFixed} file(s)`);
  }
}

// ---------------------------------------------------------------------------
// Phase 3: Validate and replace structurally broken files
// ---------------------------------------------------------------------------

function validateAndReplace(langDirs, dryRun) {
  console.log('\n[repair:validate] Checking translated files for structural errors...');

  let totalBroken = 0;
  let totalReplaced = 0;
  let totalSkipped = 0;

  for (const lang of langDirs) {
    const langDir = path.join(ROOT, lang);
    let langReplaced = 0;

    for (const f of walkMdx(langDir)) {
      const err = validateMdx(f);
      if (!err) continue;

      totalBroken++;

      const enPath = enSourcePath(f);
      if (!fs.existsSync(enPath)) {
        totalSkipped++;
        continue;
      }

      // Sanity-check: English source must itself be valid
      const enErr = validateMdx(enPath);
      if (enErr) {
        console.log(`  SKIP (EN also invalid): ${path.relative(ROOT, f)}`);
        totalSkipped++;
        continue;
      }

      if (!dryRun) fs.copyFileSync(enPath, f);
      langReplaced++;
      totalReplaced++;
    }

    if (langReplaced > 0) {
      console.log(`  ${lang}: replaced ${langReplaced} broken file(s) with EN source`);
    }
  }

  if (totalBroken === 0) {
    console.log('  All translated files are structurally valid.');
  } else {
    console.log(`  Found ${totalBroken} broken files — replaced ${totalReplaced}, skipped ${totalSkipped}`);
  }

  return totalBroken - totalReplaced - totalSkipped; // remaining failures
}

// ---------------------------------------------------------------------------
// Self-test
// ---------------------------------------------------------------------------

// Unit tests for validateMdx. Each case is [name, mdxContent, expectedError].
// expectedError === null means the file is expected to validate cleanly.
const SELF_TEST_CASES = [
  [
    'valid-self-closing',
    '---\ntitle: x\n---\n\n<Snippet name="a" />\nhello\n',
    null,
  ],
  [
    'valid-indented-fence-with-html-comment',
    '---\ntitle: x\n---\n\n<Steps>\n<Step title="x">\n    ```html\n    <!-- Place in <head> -->\n    ```\n</Step>\n</Steps>\n',
    null,
  ],
  [
    'valid-mismatched-indent-fence',
    '---\ntitle: x\n---\n\n<Tabs>\n  <Tab title="x">\n    ```javascript\ncode at col 0\n```\n  </Tab>\n</Tabs>\n',
    null,
  ],
  [
    'detect-html-comment',
    '---\ntitle: x\n---\n\n<!-- <Frame> -->\nhello\n<!-- </Frame> -->\n',
    /HTML-style comment/,
  ],
  [
    'detect-locked-pattern',
    '---\ntitle: x\n---\n\n{/* LOCKED_PATTERN_abcdef123 */}\nhello\n',
    /LOCKED_PATTERN/,
  ],
  [
    'detect-mismatch',
    '---\ntitle: x\n---\n\n<Steps>\n<Frame>\nhello\n</Step>\n</Steps>\n',
    /Mismatched tags/,
  ],
  [
    'detect-orphan-close',
    '---\ntitle: x\n---\n\nhello\n</Frame>\n',
    /no matching open tag/,
  ],
  [
    'detect-unclosed',
    '---\ntitle: x\n---\n\n<Frame>\nhello\n',
    /Unclosed tag/,
  ],
  [
    'detect-broken-fence',
    '---\ntitle: x\n---\n\n```\ntypescript\nconst x = 1;\n```\n',
    /broken code fence/,
  ],
  [
    'detect-doctype',
    '---\ntitle: x\n---\n\n<!DOCTYPE html>\nhello\n',
    /stray `<!`/,
  ],
];

function runSelfTest() {
  const tmpFile = path.join(require('os').tmpdir(), `mdx-self-test-${process.pid}.mdx`);
  let passed = 0;
  let failed = 0;

  for (const [name, content, expected] of SELF_TEST_CASES) {
    fs.writeFileSync(tmpFile, content, 'utf8');
    const got = validateMdx(tmpFile);
    const ok = expected === null
      ? got === null
      : expected instanceof RegExp
        ? typeof got === 'string' && expected.test(got)
        : got === expected;

    if (ok) {
      passed++;
      console.log(`  PASS  ${name}`);
    } else {
      failed++;
      console.log(`  FAIL  ${name}: expected ${expected}, got ${JSON.stringify(got)}`);
    }
  }

  try { fs.unlinkSync(tmpFile); } catch {}

  console.log(`\n[self-test] ${passed} passed, ${failed} failed`);
  return failed === 0;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--self-test')) {
    console.log('[self-test] Running unit tests on validateMdx...');
    const ok = runSelfTest();
    process.exit(ok ? 0 : 1);
  }

  const dryRun = args.includes('--dry-run');

  // Allow specifying languages: --langs ar,es,fr
  let langDirs;
  const langsArg = args.find((a) => a.startsWith('--langs'));
  if (langsArg) {
    const value = langsArg.includes('=') ? langsArg.split('=')[1] : args[args.indexOf(langsArg) + 1];
    langDirs = value.split(',').map((l) => l.trim());
  }

  if (!langDirs) {
    // Auto-detect from i18n.json
    const i18nPath = path.join(ROOT, 'i18n.json');
    if (fs.existsSync(i18nPath)) {
      const cfg = JSON.parse(fs.readFileSync(i18nPath, 'utf8'));
      const LINGO_TO_MINTLIFY = { 'zh-CN': 'cn' };
      langDirs = [...new Set(
        (cfg.locale?.targets || []).map((t) => LINGO_TO_MINTLIFY[t] || t),
      )];
    } else {
      langDirs = ['ar', 'cn', 'de', 'es', 'fr', 'hi', 'id', 'it', 'ja', 'ko', 'pt-BR', 'sv', 'vi'];
    }
  }

  console.log(`[repair] ${dryRun ? 'DRY RUN — ' : ''}Processing languages: ${langDirs.join(', ')}`);

  restoreLockedPatterns(langDirs, dryRun);
  repairBrokenCodeFences(langDirs, dryRun);
  repairHtmlComments(langDirs, dryRun);
  const remaining = validateAndReplace(langDirs, dryRun);

  if (remaining > 0) {
    console.log(`\n[repair] WARNING: ${remaining} files could not be repaired automatically.`);
    process.exitCode = 1;
  } else {
    console.log('\n[repair] All translation files are valid.');
  }
}

// Export for use from syncAllLanguages.ts
module.exports = { restoreLockedPatterns, repairBrokenCodeFences, repairHtmlComments, validateAndReplace, validateMdx, stripCodeAndFrontmatter };

// Run directly if executed as a script
if (require.main === module) {
  main();
}
