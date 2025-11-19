#!/usr/bin/env node

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import type { Language } from './utils/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const LANGUAGES: Language[] = ['en', 'zh', 'fr', 'de', 'id', 'ja', 'ko', 'pt-BR', 'es'];

type NavigationItem = string | NavigationObject | NavigationArray;
type NavigationObject = Record<string, unknown>;
type NavigationArray = NavigationItem[];

/**
 * Recursively processes a navigation structure and updates paths
 */
function processNavigationStructure(navItem: NavigationItem, language: Language): NavigationItem {
  if (typeof navItem === 'string') {
    // Simple page path
    if (language === 'en') {
      return navItem;
    }
    return `${language}/${navItem}`;
  }
  
  if (Array.isArray(navItem)) {
    return navItem.map(item => processNavigationStructure(item, language));
  }
  
  if (typeof navItem === 'object' && navItem !== null) {
    const processed: NavigationObject = {};
    
    for (const [key, value] of Object.entries(navItem)) {
      if (key === 'pages' && Array.isArray(value)) {
        processed[key] = value.map(page => processNavigationStructure(page, language));
      } else if (key === 'groups' && Array.isArray(value)) {
        processed[key] = value.map(group => processNavigationStructure(group, language));
      } else if (key === 'tabs' && Array.isArray(value)) {
        processed[key] = value.map(tab => processNavigationStructure(tab, language));
      } else {
        processed[key] = value;
      }
    }
    
    return processed;
  }
  
  return navItem;
}

/**
 * Creates language-specific navigation structure
 */
function createLanguageNavigation(originalNavigation: NavigationObject, language: Language): NavigationObject {
  return processNavigationStructure(originalNavigation, language) as NavigationObject;
}

/**
 * Main function to update docs.json with multi-language navigation
 */
async function main(): Promise<void> {
  console.log(chalk.blue.bold('\n🌍 Updating Navigation for Multi-Language Support\n'));
  
  try {
    // Read current docs.json
    const docsJsonPath = path.join(rootDir, 'docs.json');
    const docsConfig = await fs.readJSON(docsJsonPath) as { navigation?: NavigationObject };
    
    if (!docsConfig.navigation) {
      console.error(chalk.red('❌ Error: docs.json does not have a navigation property'));
      process.exit(1);
    }
    
    const originalNavigation = docsConfig.navigation;
    
    // Create languages array
    const languages = LANGUAGES.map(language => {
      const languageNav = createLanguageNavigation(originalNavigation, language);
      return {
        language,
        ...languageNav  // Spread tabs, groups, or pages depending on structure
      };
    });
    
    // Update docs.json with languages structure
    docsConfig.navigation = {
      languages
    } as NavigationObject;
    
    // Keep other navigation properties if they exist (like global anchors)
    if ('global' in originalNavigation) {
      (docsConfig.navigation as NavigationObject).global = originalNavigation.global;
    }
    
    // Write updated docs.json
    await fs.writeJSON(docsJsonPath, docsConfig, { spaces: 2 });
    
    console.log(chalk.green('✅ Successfully updated docs.json with multi-language navigation'));
    console.log(chalk.cyan(`\n📝 Configured languages: ${LANGUAGES.join(', ')}`));
    console.log(chalk.gray('\nNote: Make sure all translated files exist before deploying.\n'));
    
  } catch (error) {
    console.error(chalk.red('\n❌ Error updating navigation:'), error);
    process.exit(1);
  }
}

main();

