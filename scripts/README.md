# Translation Pipeline

Automated translation pipeline for Dodo Payments documentation using OpenAI's API.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env and add your OPENAI_API_KEY
   ```

3. **Get OpenAI API Key:**
   - Visit https://platform.openai.com/api-keys
   - Create a new API key
   - Add it to your `.env` file

## Usage

### Translate all files (incremental)

By default, the pipeline only translates files that:
- Don't exist in the target language
- Have been modified since the last translation

```bash
npm run translate
```

### Translate all files (full re-translation)

Re-translate all files regardless of cache:

```bash
npm run translate:full
```

### Translate to specific language

```bash
npm run translate:lang -- --lang=es
```

### Update navigation

After translation, update `docs.json` with multi-language navigation:

```bash
npm run update-nav
```

## Supported Languages

- `en` - English (source)
- `zh` - Chinese (Simplified)
- `fr` - French
- `de` - German
- `id` - Indonesian
- `ja` - Japanese
- `ko` - Korean
- `pt-BR` - Portuguese (Brazil)
- `es` - Spanish

## How It Works

1. **File Discovery**: Scans all `.mdx` files in the repository
2. **Content Parsing**: Extracts translatable content while preserving:
   - Code blocks (```language)
   - Inline code (`code`)
   - Mintlify components structure
   - Image paths and URLs
3. **Translation**: Uses OpenAI GPT-4 Turbo to translate content with specialized prompts for technical documentation
4. **File Generation**: Creates translated files in language-specific directories (e.g., `es/introduction.mdx`)
5. **Caching**: Stores file hashes to enable incremental updates

## Translation Cache

The pipeline maintains a `.translation-cache.json` file that tracks:
- Which files have been translated
- When source files were last modified
- File hashes for change detection

To clear the cache and force re-translation of all files:
```bash
rm .translation-cache.json
npm run translate
```

## Cost Considerations

- Uses GPT-4 Turbo for high-quality translations
- Processes files sequentially to avoid rate limits
- Caches translations to minimize API calls
- Typical cost: ~$0.01-0.03 per page per language

## Troubleshooting

### API Rate Limits

If you hit rate limits, the script will show errors. Wait a few minutes and re-run. The cache will prevent re-translating already completed files.

### Translation Quality

The pipeline is optimized for technical documentation. If you notice issues:
- Check that technical terms are preserved (they should be)
- Review the translated files and manually adjust if needed
- The source English files remain unchanged

### Missing Files

If a translated file is missing, delete it from the cache and re-run:
```bash
# Edit .translation-cache.json and remove the entry for that file
npm run translate
```

## File Structure

After translation, your directory structure will look like:

```
docs/
├── introduction.mdx          # English (source)
├── es/
│   └── introduction.mdx      # Spanish
├── fr/
│   └── introduction.mdx      # French
└── ...
```

## Notes

- English files remain in the root directory
- Translated files are organized in language subdirectories
- Mintlify's navigation system will automatically handle language switching
- Code examples and technical terms are preserved in all translations

