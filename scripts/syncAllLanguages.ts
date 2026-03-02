// @ts-nocheck
/**
 * Sync workflow helper:
 *
 * 1) Creates /en folder and moves api-reference, changelog, community, developer-resources,
 *    features, guides, integrations, miscellaneous, snippets folders and development.mdx,
 *    introduction.mdx, migrate-to-dodo.mdx, quickstart.mdx, welcome.mdx files into it
 * 2) Renames folders from Mintlify to Lingo codes (e.g., cn → zh-CN) so Lingo can find them
 * 3) Runs `npx lingo.dev@latest run` to update other language folders from /en + i18n.json
 * 4) Renames folders from Lingo codes to Mintlify codes (e.g., zh-CN → cn)
 * 4b) Runs post-translation repair (restore locked patterns + fix broken MDX)
 * 5) Cleans up orphaned files in target languages (files that no longer exist in /en)
 * 6) Removes files excluded from translation
 * 7) Runs scripts/addUpdateLanguage.ts for all target languages (using Mintlify codes)
 * 8) Moves all content back from /en folder to root
 *
 * Usage:
 *   node scripts/syncAllLanguages.ts
 *   node scripts/syncAllLanguages.ts --dry-run
 *   node scripts/syncAllLanguages.ts --skip-lingo
 *   node scripts/syncAllLanguages.ts --skip-addUpdate
 *   node scripts/syncAllLanguages.ts --skip-cleanup
 *
 * Notes:
 * - This file intentionally uses CommonJS (require) so Node can run it directly.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { restoreLockedPatterns, validateAndReplace } = require('./validateAndRepairTranslations.ts');

const ROOT = path.join(__dirname, '..');
const I18N_PATH = path.join(ROOT, 'i18n.json');
const EN_FOLDER = path.join(ROOT, 'en');

// Mapping from Lingo locale codes to Mintlify language codes
// Only codes that differ need to be listed here
const LINGO_TO_MINTLIFY_MAP = {
  'zh-CN': 'cn',
  // Add more mappings here if needed, e.g.:
  // 'zh-TW': 'zh-Hant',
};

// Folders and files to move into /en
const FOLDERS_TO_MOVE = [
  'api-reference',
  'changelog',
  'community',
  'developer-resources',
  'features',
  'guides',
  'integrations',
  'miscellaneous',
  'snippets',
];

const FILES_TO_MOVE = [
  'development.mdx',
  'introduction.mdx',
  'migrate-to-dodo.mdx',
  'quickstart.mdx',
  'welcome.mdx',
];

// Files to exclude from translation (relative paths from content root)
// These files will be removed from target language folders after sync
const FILES_TO_EXCLUDE_FROM_TRANSLATION = [
  'miscellaneous/faq.mdx',
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * Convert Lingo locale code to Mintlify language code
 */
function toMintlifyCode(lingoCode) {
  return LINGO_TO_MINTLIFY_MAP[lingoCode] || lingoCode;
}

/**
 * Build reverse mapping (Mintlify → Lingo)
 */
const MINTLIFY_TO_LINGO_MAP = Object.fromEntries(
  Object.entries(LINGO_TO_MINTLIFY_MAP).map(([lingo, mintlify]) => [mintlify, lingo])
);

/**
 * Rename language folders from Mintlify codes to Lingo codes (before Lingo runs)
 * e.g., cn/ → zh-CN/
 */
function renameFoldersToLingoCodes() {
  console.log('\n[rename] Renaming folders from Mintlify to Lingo codes (for Lingo)...');
  let renamed = 0;

  for (const [mintlifyCode, lingoCode] of Object.entries(MINTLIFY_TO_LINGO_MAP)) {
    const srcFolder = path.join(ROOT, mintlifyCode);
    const destFolder = path.join(ROOT, lingoCode);

    if (fs.existsSync(srcFolder)) {
      // Remove destination if it exists
      if (fs.existsSync(destFolder)) {
        fs.rmSync(destFolder, { recursive: true, force: true });
      }
      fs.renameSync(srcFolder, destFolder);
      console.log(`[rename] ${mintlifyCode}/ → ${lingoCode}/`);
      renamed++;
    }
  }

  if (renamed === 0) {
    console.log('[rename] No folders needed renaming.');
  } else {
    console.log(`[rename] Renamed ${renamed} folder(s).`);
  }
}

/**
 * Rename language folders from Lingo codes to Mintlify codes
 * e.g., zh-CN/ → cn/
 */
function renameFoldersToMintlifyCodes(lingoLangs) {
  console.log('\n[rename] Renaming folders from Lingo to Mintlify codes...');
  let renamed = 0;

  for (const lingoCode of lingoLangs) {
    const mintlifyCode = LINGO_TO_MINTLIFY_MAP[lingoCode];
    if (!mintlifyCode) continue; // No mapping needed

    const srcFolder = path.join(ROOT, lingoCode);
    const destFolder = path.join(ROOT, mintlifyCode);

    if (fs.existsSync(srcFolder)) {
      // Remove destination if it exists (from previous runs)
      if (fs.existsSync(destFolder)) {
        fs.rmSync(destFolder, { recursive: true, force: true });
      }
      fs.renameSync(srcFolder, destFolder);
      console.log(`[rename] ${lingoCode}/ → ${mintlifyCode}/`);
      renamed++;
    }
  }

  if (renamed === 0) {
    console.log('[rename] No folders needed renaming.');
  } else {
    console.log(`[rename] Renamed ${renamed} folder(s).`);
  }
}

/**
 * Recursively get all files in a directory
 */
function getAllFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      getAllFiles(fullPath, fileList);
    } else {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

/**
 * Remove empty directories recursively (bottom-up)
 */
function removeEmptyDirs(dir) {
  if (!fs.existsSync(dir)) return;
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      removeEmptyDirs(path.join(dir, entry.name));
    }
  }
  
  // Re-check after potential child removals
  const remaining = fs.readdirSync(dir);
  if (remaining.length === 0) {
    fs.rmdirSync(dir);
  }
}

/**
 * Remove files from target language folders that no longer exist in /en
 */
function cleanupOrphanedFiles(langs) {
  console.log('\n[cleanup] Removing orphaned files from target languages...');
  
  // Build set of relative paths that exist in /en
  const enFiles = getAllFiles(EN_FOLDER);
  const enRelativePaths = new Set(
    enFiles.map((f) => path.relative(EN_FOLDER, f))
  );
  
  let totalRemoved = 0;
  
  for (const lang of langs) {
    const langFolder = path.join(ROOT, lang);
    if (!fs.existsSync(langFolder)) continue;
    
    const langFiles = getAllFiles(langFolder);
    
    for (const file of langFiles) {
      const relativePath = path.relative(langFolder, file);
      
      // If this file doesn't have a corresponding file in /en, remove it
      if (!enRelativePaths.has(relativePath)) {
        fs.unlinkSync(file);
        console.log(`[cleanup] Removed orphaned: ${lang}/${relativePath}`);
        totalRemoved++;
      }
    }
    
    // Clean up any empty directories left behind
    removeEmptyDirs(langFolder);
  }
  
  if (totalRemoved === 0) {
    console.log('[cleanup] No orphaned files found.');
  } else {
    console.log(`[cleanup] Removed ${totalRemoved} orphaned file(s).`);
  }
}

/**
 * Remove files that should not be translated from target language folders
 */
function removeExcludedFiles(langs) {
  console.log('\n[exclude] Removing files excluded from translation...');
  
  let totalRemoved = 0;
  
  for (const lang of langs) {
    const langFolder = path.join(ROOT, lang);
    if (!fs.existsSync(langFolder)) continue;
    
    for (const excludedFile of FILES_TO_EXCLUDE_FROM_TRANSLATION) {
      const filePath = path.join(langFolder, excludedFile);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[exclude] Removed: ${lang}/${excludedFile}`);
        totalRemoved++;
      }
    }
    
    // Clean up any empty directories left behind
    removeEmptyDirs(langFolder);
  }
  
  if (totalRemoved === 0) {
    console.log('[exclude] No excluded files found to remove.');
  } else {
    console.log(`[exclude] Removed ${totalRemoved} excluded file(s).`);
  }
}

function getTargetLanguagesFromI18n() {
  const cfg = readJson(I18N_PATH);
  const targets = cfg?.locale?.targets;
  if (!Array.isArray(targets) || targets.length === 0) {
    throw new Error('i18n.json is missing locale.targets');
  }
  return targets;
}

function runCmd(cmd, args, cwd) {
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: false });
  if (res.error) throw res.error;
  if (typeof res.status === 'number' && res.status !== 0) {
    throw new Error(`Command failed (${res.status}): ${cmd} ${args.join(' ')}`);
  }
}

function moveToEnFolder() {
  console.log('\n[setup] Creating en folder and moving content...');
  
  // Create en folder if it doesn't exist
  if (!fs.existsSync(EN_FOLDER)) {
    fs.mkdirSync(EN_FOLDER, { recursive: true });
  }

  // Move folders
  for (const folder of FOLDERS_TO_MOVE) {
    const src = path.join(ROOT, folder);
    const dest = path.join(EN_FOLDER, folder);
    if (fs.existsSync(src)) {
      fs.renameSync(src, dest);
      console.log(`[setup] Moved folder: ${folder}`);
    }
  }

  // Move files
  for (const file of FILES_TO_MOVE) {
    const src = path.join(ROOT, file);
    const dest = path.join(EN_FOLDER, file);
    if (fs.existsSync(src)) {
      fs.renameSync(src, dest);
      console.log(`[setup] Moved file: ${file}`);
    }
  }
}

function moveBackFromEnFolder() {
  console.log('\n[cleanup] Moving content back from en folder...');

  // Move folders back
  for (const folder of FOLDERS_TO_MOVE) {
    const src = path.join(EN_FOLDER, folder);
    const dest = path.join(ROOT, folder);
    if (fs.existsSync(src)) {
      fs.renameSync(src, dest);
      console.log(`[cleanup] Moved back folder: ${folder}`);
    }
  }

  // Move files back
  for (const file of FILES_TO_MOVE) {
    const src = path.join(EN_FOLDER, file);
    const dest = path.join(ROOT, file);
    if (fs.existsSync(src)) {
      fs.renameSync(src, dest);
      console.log(`[cleanup] Moved back file: ${file}`);
    }
  }

  // Remove en folder if it's empty
  try {
    const contents = fs.readdirSync(EN_FOLDER);
    if (contents.length === 0) {
      fs.rmdirSync(EN_FOLDER);
      console.log('[cleanup] Removed empty en folder');
    }
  } catch (err) {
    // Ignore errors when trying to remove the folder
  }
}

function main() {
  const args = process.argv.slice(2);

  const dryRun = args.includes('--dry-run');
  const skipLingo = args.includes('--skip-lingo');
  const skipAddUpdate = args.includes('--skip-addUpdate');
  const skipCleanup = args.includes('--skip-cleanup');

  // Get target languages from i18n.json (Lingo codes)
  const lingoLangs = getTargetLanguagesFromI18n();
  
  // Convert to Mintlify codes for cleanup and docs.json updates
  const mintlifyLangs = lingoLangs.map(toMintlifyCode);

  // Step 1: Create en folder and move content into it
  moveToEnFolder();

  try {
    if (dryRun) {
      console.log('\n[dry-run] Not running lingo.dev, cleanup, or addUpdateLanguage.');
      // Content will be moved back in the finally block
      return;
    }

    // Step 2: Rename folders from Mintlify to Lingo codes (so Lingo can find them)
    // e.g., cn/ → zh-CN/
    renameFoldersToLingoCodes();

    if (!skipLingo) {
      console.log('\n[lingo] Running: npx --yes lingo.dev@latest run --concurrency 20');
      runCmd('npx', ['--yes', 'lingo.dev@latest', 'run', '--concurrency', '20'], ROOT);
    } else {
      console.log('\n[lingo] Skipped (--skip-lingo).');
    }

    // Step 3: Rename folders from Lingo to Mintlify codes (for Mintlify)
    // e.g., zh-CN/ → cn/
    renameFoldersToMintlifyCodes(lingoLangs);

    // Step 3b: Repair translated files (restore locked patterns + fix broken MDX)
    console.log('\n[repair] Running post-translation repair...');
    restoreLockedPatterns(mintlifyLangs, dryRun);
    validateAndReplace(mintlifyLangs, dryRun);

    // Step 4: Remove orphaned files from target languages (using Mintlify codes)
    if (!skipCleanup) {
      cleanupOrphanedFiles(mintlifyLangs);
    } else {
      console.log('\n[cleanup] Skipped (--skip-cleanup).');
    }

    // Step 5: Remove files excluded from translation (e.g., large FAQ files)
    removeExcludedFiles(mintlifyLangs);

    // Step 6: Update docs.json with language navigation
    if (!skipAddUpdate) {
      console.log(`\n[addUpdateLanguage] Updating docs.json languages: ${mintlifyLangs.join(', ')}`);
      runCmd('node', [path.join('scripts', 'addUpdateLanguage.ts'), ...mintlifyLangs], ROOT);
    } else {
      console.log('\n[addUpdateLanguage] Skipped (--skip-addUpdate).');
    }
  } finally {
    // Step 7: Move content back from en folder
    moveBackFromEnFolder();
  }
}

main();


