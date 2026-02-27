#!/usr/bin/env node
/**
 * Fix LOCKED_PATTERN comments in translated MDX files.
 *
 * The lingo.dev translation pipeline replaces JSX component tags matching
 * `lockedPatterns` with `{/* LOCKED_PATTERN_<hash> * /}` placeholders before
 * sending content to the AI translator.  The placeholders should be restored
 * afterwards, but in many files they were left un-restored, which breaks
 * Mintlify's MDX compiler ("Unexpected closing slash `/` in tag").
 *
 * Strategy
 * --------
 * 1. Build a **global hash → original tag** map by scanning every translated
 *    file alongside its English source:
 *      a. Extract ordered tags (matching the lockedPatterns regex) from EN.
 *      b. Extract ordered "items" (tags + locked-pattern comments) from the
 *         translated file.
 *      c. Walk both lists in lockstep: when the translated item is a preserved
 *         tag we skip (advancing both pointers); when it's a LOCKED_PATTERN we
 *         record the mapping and advance both.
 * 2. Replace every `{/* LOCKED_PATTERN_<hash> * /}` in every translated file
 *    with the mapped tag.
 *
 * Usage:
 *   node scripts/fixLockedPatterns.mjs            # apply fixes
 *   node scripts/fixLockedPatterns.mjs --dry-run   # preview only
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const LANG_DIRS = [
  "ar",
  "cn",
  "de",
  "es",
  "fr",
  "hi",
  "id",
  "it",
  "ja",
  "ko",
  "pt-BR",
  "sv",
  "vi",
];

// Same regex used in i18n.json lockedPatterns – matches ALL component tags
const TAG_RE_SRC =
  "<\\/?(?:Note|Tip|Warning|Info|Check|Steps|Step|Tabs|Tab|CodeGroup|Card|CardGroup|Accordion|AccordionGroup|Frame|Expandable|ResponseField|ParamField|RequestExample|ResponseExample|Tooltip|Update|Snippet|Icon)(?:\\s[^>]*)?\\/?>"; // single-line
const TAG_RE = new RegExp(TAG_RE_SRC, "g");

// Matches the locked-pattern placeholder comment
const LOCKED_RE = /\{\/\* LOCKED_PATTERN_([a-f0-9]+) \*\/\}/g;

// Combined: matches either a real tag OR a locked-pattern comment (for ordering)
const ITEM_RE = new RegExp(
  `(${TAG_RE_SRC})|(\\{/\\* LOCKED_PATTERN_[a-f0-9]+ \\*/\\})`,
  "g",
);

// ── helpers ──────────────────────────────────────────────────────────────────

function walkMdx(dir, list = []) {
  if (!fs.existsSync(dir)) return list;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walkMdx(full, list);
    else if (e.name.endsWith(".mdx")) list.push(full);
  }
  return list;
}

function enSourcePath(translatedPath) {
  // e.g. ar/features/foo.mdx → features/foo.mdx
  const rel = path.relative(ROOT, translatedPath);
  const parts = rel.split(path.sep);
  // Remove the language directory prefix
  parts.shift();
  return path.join(ROOT, ...parts);
}

function extractTags(content) {
  return [...content.matchAll(TAG_RE)].map((m) => m[0]);
}

function extractItems(content) {
  // Returns array of {type: 'tag'|'locked', value: string, hash?: string}
  return [...content.matchAll(ITEM_RE)].map((m) => {
    if (m[1]) return { type: "tag", value: m[1] };
    const hash = m[2].match(/LOCKED_PATTERN_([a-f0-9]+)/)[1];
    return { type: "locked", value: m[2], hash };
  });
}

// ── Phase 1: build hash → tag mapping ───────────────────────────────────────

const hashToTag = new Map(); // hash → original tag string
let mappingConflicts = 0;

function buildMappingFromFile(enPath, transPath) {
  if (!fs.existsSync(enPath)) return;
  const enContent = fs.readFileSync(enPath, "utf8");
  const trContent = fs.readFileSync(transPath, "utf8");

  const enTags = extractTags(enContent);
  const trItems = extractItems(trContent);

  // Walk both lists in lockstep
  let ei = 0; // English tag index
  for (const item of trItems) {
    if (ei >= enTags.length) break;

    if (item.type === "tag") {
      // This tag was preserved – it should match the English tag at this position.
      // Advance the English pointer.
      // But the translated file might have the tag while English is slightly different
      // (e.g. whitespace). Try to find the matching English tag nearby.
      if (item.value === enTags[ei]) {
        ei++;
      } else {
        // Look ahead in English tags to find a match (max 3 ahead)
        let found = false;
        for (let look = 1; look <= 3 && ei + look < enTags.length; look++) {
          if (item.value === enTags[ei + look]) {
            // The skipped English tags must have been removed from translation
            ei = ei + look + 1;
            found = true;
            break;
          }
        }
        if (!found) {
          // Tag doesn't match; could be extra in translation. Skip this item.
        }
      }
    } else {
      // LOCKED_PATTERN – this should correspond to enTags[ei]
      const currentEnTag = enTags[ei];
      if (currentEnTag) {
        if (hashToTag.has(item.hash)) {
          if (hashToTag.get(item.hash) !== currentEnTag) {
            // Conflict – keep the first mapping (more likely correct from simpler files)
            mappingConflicts++;
          }
        } else {
          hashToTag.set(item.hash, currentEnTag);
        }
        ei++;
      }
    }
  }
}

console.log("[Phase 1] Building hash → tag mapping...");

// Process simpler files first (fewer tags = more reliable mapping)
const allTransFiles = [];
for (const lang of LANG_DIRS) {
  walkMdx(path.join(ROOT, lang)).forEach((f) => {
    const content = fs.readFileSync(f, "utf8");
    const lockedCount = [...content.matchAll(LOCKED_RE)].length;
    if (lockedCount > 0) allTransFiles.push({ path: f, lockedCount });
  });
}

// Sort by locked count ascending (simpler files first = more reliable alignment)
allTransFiles.sort((a, b) => a.lockedCount - b.lockedCount);

for (const { path: transFile } of allTransFiles) {
  const enPath = enSourcePath(transFile);
  buildMappingFromFile(enPath, transFile);
}

console.log(`  Mapped ${hashToTag.size} unique hashes`);
console.log(`  Conflicts (ignored): ${mappingConflicts}`);

// ── Phase 1b: fallback – for unmapped hashes, try context-based matching ────

// Find hashes that weren't mapped in Phase 1
const allHashesInFiles = new Set();
for (const { path: transFile } of allTransFiles) {
  const content = fs.readFileSync(transFile, "utf8");
  for (const m of content.matchAll(LOCKED_RE)) {
    allHashesInFiles.add(m[1]);
  }
}

const unmapped = [...allHashesInFiles].filter((h) => !hashToTag.has(h));
if (unmapped.length > 0) {
  console.log(`  ${unmapped.length} hashes still unmapped after Phase 1`);

  // For unmapped hashes, try to infer from surrounding closing tags
  for (const { path: transFile } of allTransFiles) {
    const content = fs.readFileSync(transFile, "utf8");
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const lockedMatch = lines[i].match(
        /\{\/\* LOCKED_PATTERN_([a-f0-9]+) \*\/\}/,
      );
      if (!lockedMatch || hashToTag.has(lockedMatch[1])) continue;

      const hash = lockedMatch[1];
      const enPath = enSourcePath(transFile);
      if (!fs.existsSync(enPath)) continue;

      // Find the corresponding position in the English file by looking at
      // the closing tag that follows this locked pattern
      const enContent = fs.readFileSync(enPath, "utf8");
      const enTags = extractTags(enContent);

      // Look at lines after the locked pattern for a closing tag
      for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
        const closeMatch = lines[j].match(
          /<\/(Note|Tip|Warning|Info|Check|Steps|Step|Tabs|Tab|CodeGroup|Card|CardGroup|Accordion|AccordionGroup|Frame|Expandable|ResponseField|ParamField|RequestExample|ResponseExample|Tooltip|Update|Snippet|Icon)>/,
        );
        if (closeMatch) {
          const tagName = closeMatch[1];
          // Find an unmatched opening tag of this type in the English source
          const openingRegex = new RegExp(
            `<${tagName}\\s+[^>]+>`,
            "g",
          );
          const candidates = [...enContent.matchAll(openingRegex)].map(
            (m) => m[0],
          );
          // Try to find a candidate that isn't already mapped
          const mappedTags = new Set(hashToTag.values());
          for (const candidate of candidates) {
            if (!mappedTags.has(candidate)) {
              hashToTag.set(hash, candidate);
              break;
            }
          }
          break;
        }
      }
    }
  }

  const stillUnmapped = [...allHashesInFiles].filter(
    (h) => !hashToTag.has(h),
  );
  if (stillUnmapped.length > 0) {
    console.log(
      `  WARNING: ${stillUnmapped.length} hashes could not be mapped:`,
    );
    stillUnmapped.slice(0, 10).forEach((h) => console.log(`    ${h}`));
  }
}

// ── Phase 2: apply replacements ─────────────────────────────────────────────

const dryRun = process.argv.includes("--dry-run");
console.log(`\n[Phase 2] ${dryRun ? "DRY RUN – " : ""}Replacing locked patterns...`);

let filesFixed = 0;
let totalReplacements = 0;
let unresolvedFiles = [];

for (const { path: transFile } of allTransFiles) {
  let content = fs.readFileSync(transFile, "utf8");
  let replaced = 0;
  let unresolved = 0;

  content = content.replace(LOCKED_RE, (fullMatch, hash) => {
    const tag = hashToTag.get(hash);
    if (tag) {
      replaced++;
      return tag;
    }
    unresolved++;
    return fullMatch; // leave as-is if we can't resolve
  });

  if (replaced > 0) {
    if (!dryRun) {
      fs.writeFileSync(transFile, content, "utf8");
    }
    filesFixed++;
    totalReplacements += replaced;
  }
  if (unresolved > 0) {
    unresolvedFiles.push({
      file: path.relative(ROOT, transFile),
      unresolved,
    });
  }
}

console.log(`  Files fixed: ${filesFixed}`);
console.log(`  Total replacements: ${totalReplacements}`);

if (unresolvedFiles.length > 0) {
  console.log(`  Files with unresolved patterns: ${unresolvedFiles.length}`);
  unresolvedFiles.slice(0, 10).forEach((f) =>
    console.log(`    ${f.file} (${f.unresolved} unresolved)`),
  );
}

console.log("\nDone.");
