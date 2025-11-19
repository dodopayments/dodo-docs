import 'dotenv/config';
import OpenAI from 'openai';
import chalk from 'chalk';
import type { Language, ParsedMDX, ParsedComponent, ComponentContent } from './types.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  zh: 'Simplified Chinese',
  fr: 'French',
  de: 'German',
  id: 'Indonesian',
  ja: 'Japanese',
  ko: 'Korean',
  'pt-BR': 'Brazilian Portuguese',
  es: 'Spanish'
};

/**
 * Creates a translation prompt for technical documentation
 */
function createTranslationPrompt(language: Language): string {
  const langName = LANGUAGE_NAMES[language];
  
  return `You are a professional technical documentation translator. Translate the following content to ${langName} while following these strict rules:

1. **Preserve all placeholders**: Do NOT translate or modify any placeholders like __CODE_BLOCK_0__, __INLINE_CODE_1__, __COMPONENT_2__, etc. Keep them exactly as they appear.

2. **Preserve technical terms**: Keep the following terms in English (do not translate):
   - "Dodo Payments" (brand name)
   - API endpoint names, URLs, and paths
   - Code variable names, function names, class names
   - Technical acronyms (API, SDK, SaaS, AI, etc.)
   - Framework names (Next.js, React, TypeScript, etc.)
   - File extensions (.mdx, .json, .js, etc.)

3. **Translate user-facing text**: Translate all headings, paragraphs, descriptions, and user-visible text.

4. **Maintain markdown structure**: Preserve all markdown syntax (##, **, *, etc.) and structure.

5. **Maintain technical style**: Use appropriate technical terminology in ${langName} that matches the style of professional software documentation.

6. **Preserve links**: Keep all URLs and href attributes unchanged, but translate link text if it's user-facing.

7. **Preserve image paths**: Keep all image src paths unchanged, but translate alt text.

8. **Context awareness**: This is technical documentation for a payment processing platform. Use appropriate business and technical terminology.

Return ONLY the translated content, maintaining the exact same structure and placeholder positions.`;
}

/**
 * Translates frontmatter fields
 */
async function translateFrontmatter(frontmatter: Record<string, unknown>, language: Language): Promise<Record<string, unknown>> {
  const translated = { ...frontmatter };
  
  // Fields that should be translated
  const translatableFields = ['title', 'description', 'sidebarTitle'];
  
  for (const field of translatableFields) {
    if (frontmatter[field] && typeof frontmatter[field] === 'string') {
      try {
        const prompt = createTranslationPrompt(language);
        const response = await openai.chat.completions.create({
          model: 'gpt-4o',
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: frontmatter[field] as string }
          ],
          temperature: 0.3,
          max_tokens: 500
        });
        
        translated[field] = response.choices[0].message.content?.trim() || frontmatter[field];
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(chalk.yellow(`Warning: Failed to translate frontmatter field "${field}": ${errorMessage}`));
        // Keep original if translation fails
        translated[field] = frontmatter[field];
      }
    }
  }
  
  return translated;
}

/**
 * Translates body content
 */
async function translateBody(body: string, language: Language): Promise<string> {
  if (!body || body.trim().length === 0) {
    return body;
  }
  
  try {
    const prompt = createTranslationPrompt(language);
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: body }
      ],
      temperature: 0.3,
      max_tokens: 4000
    });
    
    return response.choices[0].message.content?.trim() || body;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Translation failed: ${errorMessage}`);
  }
}

/**
 * Translates component content
 */
async function translateComponentContent(componentContent: ComponentContent, language: Language): Promise<ComponentContent> {
  const translated: ComponentContent = {
    text: await translateBody(componentContent.text, language),
    codeBlocks: componentContent.codeBlocks,
    inlineCodes: componentContent.inlineCodes
  };
  
  return translated;
}

/**
 * Translates component attributes (like title, alt text, etc.)
 */
async function translateComponentAttributes(attributes: string, language: Language): Promise<string> {
  if (!attributes || attributes.trim().length === 0) {
    return attributes;
  }
  
  // Extract translatable attributes
  const titleMatch = attributes.match(/title="([^"]+)"/);
  const altMatch = attributes.match(/alt="([^"]+)"/);
  const tipMatch = attributes.match(/tip="([^"]+)"/);
  
  let translatedAttributes = attributes;
  
  if (titleMatch) {
    const translatedTitle = await translateBody(titleMatch[1], language);
    translatedAttributes = translatedAttributes.replace(
      /title="[^"]+"/,
      `title="${translatedTitle}"`
    );
  }
  
  if (altMatch) {
    const translatedAlt = await translateBody(altMatch[1], language);
    translatedAttributes = translatedAttributes.replace(
      /alt="[^"]+"/,
      `alt="${translatedAlt}"`
    );
  }
  
  if (tipMatch) {
    const translatedTip = await translateBody(tipMatch[1], language);
    translatedAttributes = translatedAttributes.replace(
      /tip="[^"]+"/,
      `tip="${translatedTip}"`
    );
  }
  
  return translatedAttributes;
}

/**
 * Main translation function
 */
export async function translateContent(parsed: ParsedMDX, language: Language): Promise<ParsedMDX> {
  const translated: ParsedMDX = {
    frontmatter: await translateFrontmatter(parsed.frontmatter, language),
    body: await translateBody(parsed.body, language),
    codeBlocks: parsed.codeBlocks, // Preserve as-is
    inlineCodes: parsed.inlineCodes, // Preserve as-is
    components: []
  };
  
  // Translate components
  for (const component of parsed.components) {
    const translatedComponent: ParsedComponent = {
      tag: component.tag,
      attributes: await translateComponentAttributes(component.attributes, language),
      content: component.selfClosing ? null : await translateComponentContent(component.content!, language),
      original: component.original,
      selfClosing: component.selfClosing
    };
    
    translated.components.push(translatedComponent);
  }
  
  return translated;
}

