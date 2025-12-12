// @ts-nocheck

// Usage:
//   node example.ts             # defaults to "de"
//   node example.ts de          # explicit language code
//   node example.ts es fr ...   # you can pass multiple languages
//
// For each language, this script:
// - Takes the English navigation (first language / "en")
// - Prefixes all page paths with `${lang}/`
// - Creates the language if it doesn't exist
// - Updates the existing language if it already exists (no duplicates)

// Use CommonJS so Node can run this file directly.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fs = require('fs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');

const DOCS_PATH = path.join(__dirname, '..', 'docs.json');

function readDocs() {
    const raw = fs.readFileSync(DOCS_PATH, 'utf8');
    return JSON.parse(raw);
}

function writeDocs(data) {
    const json = JSON.stringify(data, null, 2);
    fs.writeFileSync(DOCS_PATH, json + '\n', 'utf8');
}

function prefixPages(value, lang) {
    // Mirrors the jq `prefix_pages` function.
    if (typeof value === 'string') {
        // Avoid double-prefixing if it already starts with `${lang}/`.
        if (value.startsWith(`${lang}/`)) return value;
        return `${lang}/${value}`;
    }

    if (Array.isArray(value)) {
        return value.map((item) => prefixPages(item, lang));
    }

    if (value && typeof value === 'object') {
        const copy = { ...value };

        if (Array.isArray(copy.pages)) {
            copy.pages = copy.pages.map((p) => prefixPages(p, lang));
        } else if (Array.isArray(copy.groups)) {
            copy.groups = copy.groups.map((g) => prefixPages(g, lang));
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

