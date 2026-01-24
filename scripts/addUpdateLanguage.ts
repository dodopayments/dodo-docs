// @ts-nocheck

// Usage:
//   node example.ts             # defaults to "de"
//   node example.ts de          # explicit language code
//   node example.ts es fr ...   # you can pass multiple languages
//
// For each language, this script:
// - Takes the English navigation (first language / "en")
// - Prefixes all page paths with `${lang}/`
// - Only includes pages that actually exist on disk
// - Creates the language if it doesn't exist
// - Updates the existing language if it already exists (no duplicates)

// Use CommonJS so Node can run this file directly.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DOCS_PATH = path.join(ROOT, 'docs.json');

// Pages to exclude from translated navigation (these won't be prefixed with lang code)
// These pages will be removed from non-English navigation entirely
const PAGES_TO_EXCLUDE_FROM_TRANSLATION = [
    'miscellaneous/faq',
];

function readDocs() {
    const raw = fs.readFileSync(DOCS_PATH, 'utf8');
    return JSON.parse(raw);
}

function writeDocs(data) {
    const json = JSON.stringify(data, null, 2);
    fs.writeFileSync(DOCS_PATH, json + '\n', 'utf8');
}

/**
 * Check if a page file exists for the given language
 */
function pageExists(pagePath, lang) {
    // pagePath is like "features/checkout" or "developer-resources/webhooks"
    // We need to check if {lang}/{pagePath}.mdx exists
    const fullPath = path.join(ROOT, lang, pagePath + '.mdx');
    return fs.existsSync(fullPath);
}

function prefixPages(value, lang) {
    // Mirrors the jq `prefix_pages` function.
    if (typeof value === 'string') {
        // Skip pages that are excluded from translation
        if (PAGES_TO_EXCLUDE_FROM_TRANSLATION.includes(value)) {
            return null; // Will be filtered out
        }
        // Skip pages that don't exist for this language
        if (!pageExists(value, lang)) {
            return null; // Will be filtered out
        }
        // Avoid double-prefixing if it already starts with `${lang}/`.
        if (value.startsWith(`${lang}/`)) return value;
        return `${lang}/${value}`;
    }

    if (Array.isArray(value)) {
        return value
            .map((item) => prefixPages(item, lang))
            .filter((item) => item !== null); // Remove excluded/missing pages
    }

    if (value && typeof value === 'object') {
        const copy = { ...value };

        if (Array.isArray(copy.pages)) {
            copy.pages = copy.pages
                .map((p) => prefixPages(p, lang))
                .filter((p) => p !== null); // Remove excluded/missing pages
        } else if (Array.isArray(copy.groups)) {
            copy.groups = copy.groups
                .map((g) => prefixPages(g, lang))
                .filter((g) => g !== null); // Remove excluded/missing groups
        }

        // If this group/object has no pages left, return null to remove it
        if (Array.isArray(copy.pages) && copy.pages.length === 0) {
            return null;
        }
        if (Array.isArray(copy.groups) && copy.groups.length === 0) {
            return null;
        }

        return copy;
    }

    return value;
}

function ensureLanguage(nav, lang) {
    if (!nav || !Array.isArray(nav.languages) || nav.languages.length === 0) {
        throw new Error('navigation.languages is missing or empty in docs.json');
    }

    const languages = nav.languages;

    // Prefer the explicit English definition if present, otherwise fall back to the first language.
    const base = languages.find((l) => l.language === 'en') ?? languages[0];

    if (!base || !Array.isArray(base.tabs)) {
        throw new Error('Base language does not have a tabs array');
    }

    const baseTabs = base.tabs;
    const prefixedTabs = prefixPages(baseTabs, lang);

    const existingIndex = languages.findIndex((l) => l.language === lang);

    const newEntry = {
        language: lang,
        tabs: prefixedTabs,
    };

    if (existingIndex >= 0) {
        // Update the existing language (no duplicate entries).
        languages[existingIndex] = newEntry;
    } else {
        // Append a new language.
        languages.push(newEntry);
    }
}

function main() {
    const args = process.argv.slice(2);
    const langs = args.length > 0 ? args : ['de'];

    const docs = readDocs();

    for (const lang of langs) {
        ensureLanguage(docs.navigation, lang);
    }

    writeDocs(docs);
}

main();

