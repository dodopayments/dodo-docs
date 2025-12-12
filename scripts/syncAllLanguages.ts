// @ts-nocheck
/**
 * Sync workflow helper:
 *
 * 1) Runs `npx lingo.dev@latest run` to update other language folders from /en + i18n.json
 * 2) Runs scripts/addUpdateLanguage.ts for all target languages (from i18n.json)
 *
 * Usage:
 *   node scripts/syncAllLanguages.ts
 *   node scripts/syncAllLanguages.ts --dry-run
 *   node scripts/syncAllLanguages.ts --skip-lingo
 *   node scripts/syncAllLanguages.ts --skip-addUpdate
 *   node scripts/syncAllLanguages.ts --skip-broken-links
 *
 * Notes:
 * - This file intentionally uses CommonJS (require) so Node can run it directly.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const I18N_PATH = path.join(ROOT, 'i18n.json');

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

function tryRunBrokenLinks(cwd) {
  // Team workflow: always use `mint` (not `mintlify`).
  console.log('\n[broken-links] Running: npx --yes mint broken-links');

  const res = spawnSync('npx', ['--yes', 'mint', 'broken-links'], {
    cwd,
    stdio: 'inherit',
    shell: false,
  });

  if (res.error) throw res.error;

  // `mint broken-links` typically exits non-zero when it *finds* broken links.
  // That's not a "failed to run" situation; it's a failed check.
  // We intentionally DO NOT throw here; we surface a clean message and let the caller decide how to fail the process.
  if (typeof res.status === 'number' && res.status !== 0) {
    console.error(
      `\n[broken-links] Check returned non-zero exit (${res.status}). It may have found broken links or failed to run. See output above.`
    );
    return { ok: false, status: res.status };
  }

  // If the process terminated due to a signal, `status` can be null.
  // Treat it as a failed check so callers can fail CI, but keep output readable.
  if (res.status == null && res.signal) {
    console.error(
      `\n[broken-links] Check did not exit cleanly (signal: ${res.signal}). See output above.`
    );
    return { ok: false, status: 1, signal: res.signal };
  }

  return { ok: true, status: 0 };
}

function main() {
  const args = process.argv.slice(2);

  const dryRun = args.includes('--dry-run');
  const skipLingo = args.includes('--skip-lingo');
  const skipAddUpdate = args.includes('--skip-addUpdate');
  const skipBrokenLinks = args.includes('--skip-broken-links');

  if (dryRun) {
    console.log('\n[dry-run] Not running lingo.dev, addUpdateLanguage, or broken-links.');
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

  if (!skipBrokenLinks) {
    const bl = tryRunBrokenLinks(ROOT);
    if (bl && bl.ok === false) {
      // Preserve non-zero status for CI, but avoid crashing with an exception stack.
      process.exitCode = typeof bl.status === 'number' ? bl.status : 1;
    }
  } else {
    console.log('\n[broken-links] Skipped (--skip-broken-links).');
  }
}

main();


