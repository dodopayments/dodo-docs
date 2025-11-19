import matter from 'gray-matter';
import type { ParsedMDX, ParsedComponent, ComponentContent } from './types.js';

/**
 * Parses MDX content into structured components
 */
export function parseMDX(content: string): ParsedMDX {
  const { data: frontmatter, content: body } = matter(content);
  
  // Extract code blocks and replace with placeholders
  const codeBlockRegex = /```[\s\S]*?```/g;
  const codeBlocks: string[] = [];
  let codeBlockIndex = 0;
  
  let processedBody = body.replace(codeBlockRegex, (match) => {
    const placeholder = `__CODE_BLOCK_${codeBlockIndex}__`;
    codeBlocks.push(match);
    codeBlockIndex++;
    return placeholder;
  });
  
  // Extract inline code and replace with placeholders
  const inlineCodeRegex = /`[^`\n]+`/g;
  const inlineCodes: string[] = [];
  let inlineCodeIndex = 0;
  
  processedBody = processedBody.replace(inlineCodeRegex, (match) => {
    const placeholder = `__INLINE_CODE_${inlineCodeIndex}__`;
    inlineCodes.push(match);
    inlineCodeIndex++;
    return placeholder;
  });
  
  // Extract Mintlify components (handles both self-closing and paired tags)
  const componentRegex = /<(\w+)([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g;
  const components: ParsedComponent[] = [];
  let componentIndex = 0;
  
  processedBody = processedBody.replace(componentRegex, (match, tagName: string, attributes: string, content: string | undefined) => {
    const placeholder = `__COMPONENT_${componentIndex}__`;
    
    // Handle self-closing tags
    if (match.endsWith('/>') || !content) {
      components.push({
        tag: tagName,
        attributes: attributes.trim(),
        content: null,
        original: match,
        selfClosing: true
      });
    } else {
      // Parse component content recursively
      const parsedContent = parseComponentContent(content);
      
      components.push({
        tag: tagName,
        attributes: attributes.trim(),
        content: parsedContent,
        original: match,
        selfClosing: false
      });
    }
    
    componentIndex++;
    return placeholder;
  });
  
  return {
    frontmatter,
    body: processedBody,
    codeBlocks,
    inlineCodes,
    components
  };
}

/**
 * Recursively parse component content
 */
function parseComponentContent(content: string): ComponentContent {
  // Extract nested code blocks
  const codeBlockRegex = /```[\s\S]*?```/g;
  const codeBlocks: string[] = [];
  let codeBlockIndex = 0;
  
  let processed = content.replace(codeBlockRegex, (match) => {
    const placeholder = `__CODE_BLOCK_${codeBlockIndex}__`;
    codeBlocks.push(match);
    codeBlockIndex++;
    return placeholder;
  });
  
  // Extract inline code
  const inlineCodeRegex = /`[^`\n]+`/g;
  const inlineCodes: string[] = [];
  let inlineCodeIndex = 0;
  
  processed = processed.replace(inlineCodeRegex, (match) => {
    const placeholder = `__INLINE_CODE_${inlineCodeIndex}__`;
    inlineCodes.push(match);
    inlineCodeIndex++;
    return placeholder;
  });
  
  return {
    text: processed,
    codeBlocks,
    inlineCodes
  };
}

/**
 * Reconstructs MDX content from parsed structure
 */
export function reconstructMDX(parsed: ParsedMDX): string {
  const { frontmatter, body, codeBlocks, inlineCodes, components } = parsed;
  
  // Restore components (in reverse order to maintain indices)
  let processedBody = body;
  for (let i = components.length - 1; i >= 0; i--) {
    const component = components[i];
    const placeholder = `__COMPONENT_${i}__`;
    
    let restored: string;
    if (component.selfClosing) {
      restored = `<${component.tag}${component.attributes ? ' ' + component.attributes : ''} />`;
    } else {
      const restoredContent = restoreComponentContent(component.content!);
      restored = `<${component.tag}${component.attributes ? ' ' + component.attributes : ''}>${restoredContent}</${component.tag}>`;
    }
    
    processedBody = processedBody.replace(placeholder, restored);
  }
  
  // Restore inline code (in reverse order)
  for (let i = inlineCodes.length - 1; i >= 0; i--) {
    const placeholder = `__INLINE_CODE_${i}__`;
    processedBody = processedBody.replace(placeholder, inlineCodes[i]);
  }
  
  // Restore code blocks (in reverse order)
  for (let i = codeBlocks.length - 1; i >= 0; i--) {
    const placeholder = `__CODE_BLOCK_${i}__`;
    processedBody = processedBody.replace(placeholder, codeBlocks[i]);
  }
  
  // Reconstruct frontmatter
  const frontmatterString = matter.stringify('', frontmatter).trim();
  
  return frontmatterString + '\n\n' + processedBody;
}

/**
 * Restore component content
 */
function restoreComponentContent(content: ComponentContent): string {
  let { text, codeBlocks, inlineCodes } = content;
  
  // Restore inline code
  for (let i = inlineCodes.length - 1; i >= 0; i--) {
    const placeholder = `__INLINE_CODE_${i}__`;
    text = text.replace(placeholder, inlineCodes[i]);
  }
  
  // Restore code blocks
  for (let i = codeBlocks.length - 1; i >= 0; i--) {
    const placeholder = `__CODE_BLOCK_${i}__`;
    text = text.replace(placeholder, codeBlocks[i]);
  }
  
  return text;
}

