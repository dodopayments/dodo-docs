#!/usr/bin/env node

import 'dotenv/config';
import { glob } from 'glob';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import chalk from 'chalk';
import ora from 'ora';
import { parseMDX, reconstructMDX } from './utils/mdx-parser.js';
import { translateContent } from './utils/translator.js';
import { getTranslationCache, updateTranslationCache } from './utils/cache.js';
import type { Language, TranslationResult, TranslationResults } from './utils/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Supported languages
const LANGUAGES: Record<Language, string> = {
  en: 'English',
  zh: 'Chinese (Simplified)',
  fr: 'French',
  de: 'German',
  id: 'Indonesian',
  ja: 'Japanese',
  ko: 'Korean',
  'pt-BR': 'Portuguese (Brazil)',
  es: 'Spanish'
};

// Files/directories to exclude
const EXCLUDE_PATTERNS = [
  'node_modules/**',
  '.git/**',
  'scripts/**',
  'coordination/**',
  '**/en/**', // Exclude existing language directories
  '**/zh/**',
  '**/fr/**',
  '**/de/**',
  '**/id/**',
  '**/ja/**',
  '**/ko/**',
  '**/pt-BR/**',
  '**/es/**',
  'package*.json',
  '*.lock',
  '*.log',
  '.env*',
  'README.md',
  'CONTRIBUTING.md',
  'LICENSE'
];

async function findMDXFiles(): Promise<string[]> {
  const spinner = ora('Scanning for MDX files...').start();
  
  try {
    const files = await glob('**/*.mdx', {
      cwd: rootDir,
      ignore: EXCLUDE_PATTERNS,
      absolute: true
    });
    
    spinner.succeed(`Found ${files.length} MDX files`);
    return files;
  } catch (error) {
    spinner.fail('Failed to scan files');
    throw error;
  }
}

function getRelativePath(filePath: string): string {
  return path.relative(rootDir, filePath);
}

function getTargetPath(filePath: string, language: Language): string {
  const relativePath = getRelativePath(filePath);
  const dir = path.dirname(relativePath);
  const filename = path.basename(relativePath);
  
  if (dir === '.') {
    return path.join(rootDir, language, filename);
  }
  return path.join(rootDir, language, dir, filename);
}

function calculateContentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function shouldTranslate(filePath: string, language: Language, fullMode = false): Promise<boolean> {
  const targetPath = getTargetPath(filePath, language);
  const targetExists = await fs.pathExists(targetPath);
  
  if (!targetExists) {
    return true; // File doesn't exist, needs translation
  }
  
  if (fullMode) {
    return true; // Full mode, translate everything
  }
  
  // Check if source file content has changed
  const cache = getTranslationCache();
  const relativePath = getRelativePath(filePath);
  
  // Calculate content-based hash
  const content = await fs.readFile(filePath, 'utf-8');
  const sourceHash = calculateContentHash(content);
  
  const cacheKey = `${relativePath}:${language}`;
  const cachedHash = cache[cacheKey];
  
  if (cachedHash !== sourceHash) {
    return true; // File content has changed
  }
  
  return false; // File is up to date
}

async function translateFile(filePath: string, language: Language, fullMode = false): Promise<TranslationResult> {
  const relativePath = getRelativePath(filePath);
  
  if (!(await shouldTranslate(filePath, language, fullMode))) {
    return { skipped: true, path: relativePath };
  }
  
  const spinner = ora(`Translating ${relativePath} to ${LANGUAGES[language]}...`).start();
  
  try {
    // Read source file
    const content = await fs.readFile(filePath, 'utf-8');
    
    // Calculate content-based hash for cache
    const sourceHash = calculateContentHash(content);
    
    // Parse MDX content
    const parsed = parseMDX(content);
    
    // Translate content
    const translated = await translateContent(parsed, language);
    
    // Reconstruct MDX
    const translatedMDX = reconstructMDX(translated);
    
    // Write translated file
    const targetPath = getTargetPath(filePath, language);
    await fs.ensureDir(path.dirname(targetPath));
    await fs.writeFile(targetPath, translatedMDX, 'utf-8');
    
    // Update cache with content hash
    updateTranslationCache(getRelativePath(filePath), language, sourceHash);
    
    spinner.succeed(`Translated ${relativePath} to ${LANGUAGES[language]}`);
    return { success: true, path: relativePath };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    spinner.fail(`Failed to translate ${relativePath}: ${errorMessage}`);
    return { error: true, path: relativePath, message: errorMessage };
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const fullMode = args.includes('--full');
  const langArg = args.find(arg => arg.startsWith('--lang='));
  const targetLanguages = (langArg 
    ? [langArg.split('=')[1] as Language]
    : Object.keys(LANGUAGES).filter(lang => lang !== 'en') as Language[]);
  
  console.log(chalk.blue.bold('\n🌍 Dodo Docs Translation Pipeline\n'));
  
  if (fullMode) {
    console.log(chalk.yellow('⚠️  Full mode: All files will be re-translated\n'));
  }
  
  // Check for OpenAI API key
  if (!process.env.OPENAI_API_KEY) {
    console.error(chalk.red('❌ Error: OPENAI_API_KEY environment variable is not set'));
    console.log(chalk.gray('Please set it in your .env file or export it in your shell'));
    process.exit(1);
  }
  
  try {
    // Find all MDX files
    const files = await findMDXFiles();
    
    if (files.length === 0) {
      console.log(chalk.yellow('No MDX files found to translate'));
      return;
    }
    
    console.log(chalk.cyan(`\nTranslating to ${targetLanguages.length} language(s): ${targetLanguages.join(', ')}\n`));
    
    const results: TranslationResults = {
      success: 0,
      skipped: 0,
      errors: 0
    };
    
    // Process each language
    for (const language of targetLanguages) {
      console.log(chalk.blue.bold(`\n📝 Processing ${LANGUAGES[language]} (${language})...\n`));
      
      // Process each file
      for (const file of files) {
        const result = await translateFile(file, language, fullMode);
        
        if (result.success) {
          results.success++;
        } else if (result.skipped) {
          results.skipped++;
        } else if (result.error) {
          results.errors++;
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // Save cache
    const cache = getTranslationCache();
    await fs.writeJSON(
      path.join(rootDir, '.translation-cache.json'),
      cache,
      { spaces: 2 }
    );
    
    // Print summary
    console.log(chalk.blue.bold('\n\n📊 Translation Summary\n'));
    console.log(chalk.green(`✅ Successfully translated: ${results.success}`));
    console.log(chalk.yellow(`⏭️  Skipped (up to date): ${results.skipped}`));
    if (results.errors > 0) {
      console.log(chalk.red(`❌ Errors: ${results.errors}`));
    }
    console.log(chalk.cyan('\n✨ Translation complete!'));
    console.log(chalk.gray('\nNext step: Run "npm run update-nav" to update docs.json with multi-language navigation\n'));
    
  } catch (error) {
    console.error(chalk.red('\n❌ Fatal error:'), error);
    process.exit(1);
  }
}

main();

