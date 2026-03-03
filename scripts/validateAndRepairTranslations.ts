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
 *   3. **Structurally corrupted files** — the AI translator occasionally breaks
 *      tag nesting (mismatched open/close, deleted tags, duplicated sections).
 *      Files that still fail MDX compilation after steps 1–2 are replaced with the
 *      English source so the site always builds.  They will be re-translated on
 *      the next sync run.
 *
 * Usage:
 *   node scripts/validateAndRepairTranslations.ts                # run repairs
 *   node scripts/validateAndRepairTranslations.ts --dry-run      # preview only
 *   node scripts/validateAndRepairTranslations.ts --langs ar,es  # specific languages
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

// Locked-pattern placeholder left by lingo.dev
const LOCKED_RE = /\{\/\* LOCKED_PATTERN_([a-f0-9]+) \*\/\}/g;

// Combined: real tag OR locked-pattern (for ordered extraction)
const ITEM_RE = new RegExp(
  `(${TAG_RE_SRC})|(\\{/\\* LOCKED_PATTERN_[a-f0-9]+ \\*/\\})`,
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

/** Lightweight MDX syntax validation (no dependencies). */
function validateMdx(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');

  // Strip frontmatter
  const stripped = content.replace(/^---[\s\S]*?---/, '');

  // Remaining LOCKED_PATTERN placeholders → always invalid
  if (/\{\/\* LOCKED_PATTERN_[a-f0-9]+ \*\/\}/.test(stripped)) {
    return 'Contains un-restored LOCKED_PATTERN placeholders';
  }

  // Broken code fences: ```\n\n<lang> or ```\n<lang> outside a valid block
  // This pattern causes "Could not parse expression with acorn" errors.
  const brokenFenceRe = /^```[ \t]*\n(?:\n)?(?:typescript|javascript|json|bash|python|tsx|jsx|css|html|yaml|toml|shell|sh|sql|go|rust|ruby|php|csharp|java|kotlin|swift|xml|diff|text|plaintext|curl|powershell)[ \t]*$/m;
  if (brokenFenceRe.test(stripped)) {
    return 'Contains broken code fence (split language identifier)';
  }

  // Check for obviously broken JSX nesting via a simple tag-stack validator.
  // This catches the vast majority of translation-introduced structural bugs
  // without requiring a full MDX compiler at runtime.
  const tagStack = [];
  const componentNames =
    'Note|Tip|Warning|Info|Check|Steps|Step|Tabs|Tab|CodeGroup|Card|CardGroup|Accordion|AccordionGroup|Frame|Expandable|ResponseField|ParamField|RequestExample|ResponseExample|Tooltip|Update|Snippet|Icon';
  // Only check tags outside of fenced code blocks
  const codeBlockRe = /^```[\s\S]*?^```/gm;
  const outsideCode = stripped.replace(codeBlockRe, '');
  const tagRe = new RegExp(
    `<(\\/?)(?:${componentNames})(\\s[^>]*)?\\/?>`,
    'g',
  );
  let m;
  while ((m = tagRe.exec(outsideCode)) !== null) {
    const fullTag = m[0];
    const isClosing = m[1] === '/';
    const isSelfClosing = fullTag.endsWith('/>');

    if (isSelfClosing && !isClosing) {
      continue; // self-closing — no push/pop
    }

    // Extract component name
    const nameMatch = fullTag.match(
      /^<\/?([A-Z][a-zA-Z]*)/,
    );
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

  return null; // valid
}

// ---------------------------------------------------------------------------
// Phase 1: Restore LOCKED_PATTERN placeholders
// ---------------------------------------------------------------------------

function restoreLockedPatterns(langDirs, dryRun) {
  console.log('\n[repair:locked-patterns] Building hash → tag mapping...');
  const hashToTag = new Map();
  let conflicts = 0;

  // Collect all translated files that contain locked patterns
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

  // Process simpler files first (fewer patterns = more reliable alignment)
  transFiles.sort((a, b) => a.count - b.count);

  for (const { path: tf } of transFiles) {
    const enPath = enSourcePath(tf);
    if (!fs.existsSync(enPath)) continue;

    const enTags = extractTags(fs.readFileSync(enPath, 'utf8'));
    const trItems = extractItems(fs.readFileSync(tf, 'utf8'));

    let ei = 0;
    for (const item of trItems) {
      if (ei >= enTags.length) break;

      if (item.type === 'tag') {
        if (item.value === enTags[ei]) {
          ei++;
        } else {
          // Look ahead up to 3 positions for a match
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
          if (hashToTag.has(item.hash) && hashToTag.get(item.hash) !== tag) {
            conflicts++;
          } else {
            hashToTag.set(item.hash, tag);
          }
          ei++;
        }
      }
    }
  }

  console.log(`  Mapped ${hashToTag.size} unique hashes (${conflicts} conflicts ignored)`);

  // Apply replacements
  let filesFixed = 0;
  let totalReplacements = 0;

  for (const { path: tf } of transFiles) {
    let content = fs.readFileSync(tf, 'utf8');
    let replaced = 0;

    content = content.replace(LOCKED_RE, (full, hash) => {
      const tag = hashToTag.get(hash);
      if (tag) { replaced++; return tag; }
      return full;
    });

    if (replaced > 0) {
      if (!dryRun) fs.writeFileSync(tf, content, 'utf8');
      filesFixed++;
      totalReplacements += replaced;
    }
  }

  console.log(`  Restored ${totalReplacements} patterns in ${filesFixed} files`);
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
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
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
  const remaining = validateAndReplace(langDirs, dryRun);

  if (remaining > 0) {
    console.log(`\n[repair] WARNING: ${remaining} files could not be repaired automatically.`);
    process.exitCode = 1;
  } else {
    console.log('\n[repair] All translation files are valid.');
  }
}

// Export for use from syncAllLanguages.ts
module.exports = { restoreLockedPatterns, repairBrokenCodeFences, validateAndReplace, validateMdx };

// Run directly if executed as a script
if (require.main === module) {
  main();
}
