import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Language, TranslationCache } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../..');
const cachePath = path.join(rootDir, '.translation-cache.json');

let cache: TranslationCache | null = null;

/**
 * Loads translation cache from disk
 */
function loadCache(): TranslationCache {
  if (cache !== null) {
    return cache;
  }
  
  if (fs.existsSync(cachePath)) {
    try {
      cache = fs.readJSONSync(cachePath) as TranslationCache;
      return cache;
    } catch (error) {
      console.warn('Failed to load translation cache, starting fresh');
      cache = {};
      return cache;
    }
  }
  
  cache = {};
  return cache;
}

/**
 * Gets the translation cache
 */
export function getTranslationCache(): TranslationCache {
  return loadCache();
}

/**
 * Updates the translation cache
 */
export function updateTranslationCache(filePath: string, language: Language, hash: string): void {
  const cache = loadCache();
  const key = `${filePath}:${language}`;
  cache[key] = hash;
}

/**
 * Clears the translation cache
 */
export function clearTranslationCache(): void {
  cache = {};
  if (fs.existsSync(cachePath)) {
    fs.removeSync(cachePath);
  }
}

