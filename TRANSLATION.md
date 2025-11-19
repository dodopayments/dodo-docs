# Multi-Language Translation Pipeline

This document explains how to use the automated translation pipeline for Dodo Payments documentation.

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up your OpenAI API key:**
   ```bash
   cp .env.example .env
   # Edit .env and add: OPENAI_API_KEY=your_key_here
   ```

3. **Run translation:**
   ```bash
   npm run translate
   ```

4. **Update navigation:**
   ```bash
   npm run update-nav
   ```

## Supported Languages

- 🇬🇧 English (en) - Source language
- 🇨🇳 Chinese Simplified (zh)
- 🇫🇷 French (fr)
- 🇩🇪 German (de)
- 🇮🇩 Indonesian (id)
- 🇯🇵 Japanese (ja)
- 🇰🇷 Korean (ko)
- 🇧🇷 Portuguese Brazil (pt-BR)
- 🇪🇸 Spanish (es)

## How It Works

### 1. File Discovery
The pipeline scans all `.mdx` files in your repository (excluding language directories and build files).

### 2. Content Parsing
Each MDX file is parsed to extract:
- **Frontmatter** (title, description, etc.) - Translated
- **Body text** - Translated
- **Code blocks** (```language) - Preserved as-is
- **Inline code** (`code`) - Preserved as-is
- **Mintlify components** - Text content translated, structure preserved
- **Links and images** - URLs preserved, alt text translated

### 3. Translation
Uses OpenAI GPT-4o with specialized prompts that:
- Preserve technical terms (Dodo Payments, API, SDK, etc.)
- Maintain code syntax
- Keep URLs and file paths unchanged
- Translate user-facing content appropriately

### 4. File Generation
Creates translated files in language-specific directories:
```
docs/
├── introduction.mdx          # English (source)
├── es/
│   └── introduction.mdx      # Spanish
├── fr/
│   └── introduction.mdx      # French
└── ...
```

### 5. Navigation Update
Updates `docs.json` to use Mintlify's multi-language navigation structure.

## Commands

### Translate (Incremental)
Only translates files that are new or have been modified:
```bash
npm run translate
```

### Translate (Full)
Re-translates all files regardless of cache:
```bash
npm run translate:full
```

### Translate Specific Language
```bash
npm run translate:lang -- --lang=es
```

### Update Navigation
After translation, update the navigation structure:
```bash
npm run update-nav
```

## Translation Cache

The pipeline maintains `.translation-cache.json` to track:
- Which files have been translated
- When source files were last modified
- File hashes for change detection

To clear the cache:
```bash
rm .translation-cache.json
```

## Cost Estimation

- **Model**: GPT-4o
- **Average cost per page**: ~$0.01-0.03 per language
- **Total pages**: ~200+ MDX files
- **Estimated cost for full translation**: ~$15-50 (one-time)

Subsequent runs (incremental) will only translate changed files, significantly reducing costs.

## Troubleshooting

### API Rate Limits
If you hit rate limits, wait a few minutes and re-run. The cache prevents re-translating completed files.

### Translation Quality Issues
- Technical terms should be preserved automatically
- Review translated files and manually adjust if needed
- Source English files remain unchanged

### Missing Translations
If a file wasn't translated:
1. Check the error messages in the console
2. Delete the cache entry for that file
3. Re-run the translation

## Workflow

### Initial Setup
1. Run `npm run translate` to translate all files
2. Run `npm run update-nav` to update navigation
3. Review translated files
4. Commit changes

### Ongoing Updates
1. Edit English source files
2. Run `npm run translate` (only changed files will be translated)
3. Review changes
4. Commit

## Notes

- English files stay in the root directory
- Translated files are in language subdirectories
- Mintlify automatically handles language switching
- Code examples are preserved in all languages
- Technical terms and brand names are preserved

## File Structure

```
dodo-docs/
├── scripts/
│   ├── translate.js              # Main translation script
│   ├── update-navigation.js      # Navigation updater
│   └── utils/
│       ├── mdx-parser.js         # MDX content parser
│       ├── translator.js         # OpenAI translation service
│       └── cache.js              # Translation cache manager
├── .translation-cache.json       # Translation cache (gitignored)
├── .env                          # API keys (gitignored)
├── package.json
└── docs.json                     # Updated with multi-language nav
```

