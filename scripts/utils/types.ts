export type Language = 'en' | 'zh' | 'fr' | 'de' | 'id' | 'ja' | 'ko' | 'pt-BR' | 'es';

export interface ComponentContent {
  text: string;
  codeBlocks: string[];
  inlineCodes: string[];
}

export interface ParsedComponent {
  tag: string;
  attributes: string;
  content: ComponentContent | null;
  original: string;
  selfClosing: boolean;
}

export interface ParsedMDX {
  frontmatter: Record<string, unknown>;
  body: string;
  codeBlocks: string[];
  inlineCodes: string[];
  components: ParsedComponent[];
}

export interface TranslationResult {
  success?: boolean;
  skipped?: boolean;
  error?: boolean;
  path: string;
  message?: string;
}

export interface TranslationResults {
  success: number;
  skipped: number;
  errors: number;
}

export type TranslationCache = Record<string, string>;

