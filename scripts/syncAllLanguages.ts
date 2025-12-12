// @ts-nocheck
/**
 * Sync workflow helper:
 *
 * 1) Creates /en folder and moves api-reference, changelog, community, developer-resources,
 *    features, guides, integrations, miscellaneous, snippets folders and development.mdx,
 *    introduction.mdx, migrate-to-dodo.mdx, quickstart.mdx, welcome.mdx files into it
 * 2) Runs `npx lingo.dev@latest run` to update other language folders from /en + i18n.json
 * 3) Runs scripts/addUpdateLanguage.ts for all target languages (from i18n.json)
 * 4) Moves all content back from /en folder to root
 *
 * Usage:
 *   node scripts/syncAllLanguages.ts
 *   node scripts/syncAllLanguages.ts --dry-run
 *   node scripts/syncAllLanguages.ts --skip-lingo
 *   node scripts/syncAllLanguages.ts --skip-addUpdate
 *
 * Notes:
 * - This file intentionally uses CommonJS (require) so Node can run it directly.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const I18N_PATH = path.join(ROOT, 'i18n.json');
const EN_FOLDER = path.join(ROOT, 'en');

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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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

  // Step 1: Create en folder and move content into it
  moveToEnFolder();

  try {
    if (dryRun) {
      console.log('\n[dry-run] Not running lingo.dev or addUpdateLanguage.');
      // Content will be moved back in the finally block
      return;
    }

    if (!skipLingo) {
      console.log('\n[lingo] Running: npx --yes lingo.dev@latest run');
      runCmd('npx', ['--yes', 'lingo.dev@latest', 'run'], ROOT);
    } else {
      console.log('\n[lingo] Skipped (--skip-lingo).');
    }

    if (!skipAddUpdate) {
      const langs = getTargetLanguagesFromI18n();
      console.log(`\n[addUpdateLanguage] Updating docs.json languages: ${langs.join(', ')}`);
      runCmd('node', [path.join('scripts', 'addUpdateLanguage.ts'), ...langs], ROOT);
    } else {
      console.log('\n[addUpdateLanguage] Skipped (--skip-addUpdate).');
    }
  } finally {
    // Step 2: Move content back from en folder
    moveBackFromEnFolder();
  }
}

main();


