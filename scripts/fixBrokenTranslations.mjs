#!/usr/bin/env node
/**
 * Fix structurally broken translated MDX files by replacing them with the
 * English source.
 *
 * After the LOCKED_PATTERN restoration pass, some translated files still have
 * corrupted tag structures (mismatched nesting, missing opening/closing tags,
 * duplicated sections, etc.) caused by the AI translator.
 *
 * For these files, the only reliable fix is to replace them with the English
 * source.  They can be re-translated in the next lingo.dev sync run.
 *
 * Usage:
 *   node scripts/fixBrokenTranslations.mjs            # apply fixes
 *   node scripts/fixBrokenTranslations.mjs --dry-run   # preview only
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { compile } = await import("@mdx-js/mdx");

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
  const rel = path.relative(ROOT, translatedPath);
  const parts = rel.split(path.sep);
  parts.shift(); // remove language directory
  return path.join(ROOT, ...parts);
}

async function testFile(f) {
  try {
    const content = fs.readFileSync(f, "utf8");
    const stripped = content.replace(/^---[\s\S]*?---/, "");
    await compile(stripped);
    return null;
  } catch (e) {
    return e.message.split("\n")[0];
  }
}

const dryRun = process.argv.includes("--dry-run");
console.log(
  `[fixBrokenTranslations] ${dryRun ? "DRY RUN – " : ""}Scanning for broken files...\n`,
);

let totalFixed = 0;
let totalSkipped = 0;
let noEnSource = 0;

for (const lang of LANG_DIRS) {
  const files = walkMdx(path.join(ROOT, lang));
  let langFixed = 0;

  for (const f of files) {
    const err = await testFile(f);
    if (!err) continue;

    const enPath = enSourcePath(f);
    if (!fs.existsSync(enPath)) {
      noEnSource++;
      continue;
    }

    // Verify the English source itself compiles
    const enErr = await testFile(enPath);
    if (enErr) {
      console.log(`  SKIP (EN broken): ${path.relative(ROOT, f)}`);
      totalSkipped++;
      continue;
    }

    // Replace with English source
    if (!dryRun) {
      fs.copyFileSync(enPath, f);
    }
    langFixed++;
    totalFixed++;
  }

  if (langFixed > 0) {
    console.log(`  ${lang}: fixed ${langFixed} files`);
  }
}

console.log(`\nTotal files replaced with EN source: ${totalFixed}`);
if (totalSkipped > 0) console.log(`Skipped (EN also broken): ${totalSkipped}`);
if (noEnSource > 0) console.log(`Skipped (no EN source): ${noEnSource}`);
console.log("Done.");
