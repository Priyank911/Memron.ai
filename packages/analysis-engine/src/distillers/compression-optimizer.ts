/**
 * Compression Optimizer
 * Optimizes content compression while preserving essential information
 */

import { analyze } from '../llm/groq-client';
import { COMPRESSION_PROMPT } from '../llm/prompts';

export interface CompressionResult {
  compressed: string;
  preservedElements: string[];
  compressionRatio: number;
  originalTokens: number;
  compressedTokens: number;
}

export interface CompressionConfig {
  targetRatio?: number; // Target compression ratio (e.g., 0.2 = 20% of original)
  preserveKeywords?: string[];
  maxOutputLength?: number;
}

const DEFAULT_CONFIG: Required<CompressionConfig> = {
  targetRatio: 0.2,
  preserveKeywords: [],
  maxOutputLength: 1000,
};

/**
 * Estimate token count
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Remove common filler words
 */
function removeFiller(text: string): string {
  const fillers = [
    /\b(basically|essentially|actually|really|very|quite|just|simply|certainly|definitely)\b/gi,
    /\b(as you can see|as mentioned|in other words|that is to say)\b/gi,
    /\b(i think|i believe|it seems|perhaps|maybe)\b/gi,
    /\b(let me|allow me to|i would like to)\b/gi,
  ];

  let result = text;
  for (const filler of fillers) {
    result = result.replace(filler, '');
  }

  return result.replace(/\s+/g, ' ').trim();
}

/**
 * Extract key sentences
 */
function extractKeySentences(text: string, maxCount: number = 5): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [];

  // Score sentences by importance indicators
  const scored = sentences.map((sentence) => {
    let score = 0;

    // Longer sentences (up to a point) are often more informative
    const wordCount = sentence.split(/\s+/).length;
    if (wordCount >= 10 && wordCount <= 30) score += 2;

    // Contains technical terms
    if (/\b(function|class|method|api|error|config|implement|parameter)\b/i.test(sentence)) {
      score += 3;
    }

    // Contains action verbs
    if (/\b(create|update|delete|fix|add|remove|change|modify)\b/i.test(sentence)) {
      score += 2;
    }

    // Contains code-like content
    if (/[`"'][\w.]+[`"']|[\w]+\(|{|}|->|=>/i.test(sentence)) {
      score += 2;
    }

    // Contains numbers or specific values
    if (/\d+/.test(sentence)) {
      score += 1;
    }

    return { sentence, score };
  });

  // Sort by score and take top sentences
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxCount)
    .map((s) => s.sentence.trim());
}

/**
 * Abbreviate common terms
 */
function abbreviate(text: string): string {
  const abbreviations: Record<string, string> = {
    'configuration': 'config',
    'function': 'fn',
    'parameter': 'param',
    'parameters': 'params',
    'application': 'app',
    'database': 'db',
    'environment': 'env',
    'directory': 'dir',
    'documentation': 'docs',
    'implementation': 'impl',
    'authentication': 'auth',
    'authorization': 'authz',
    'repository': 'repo',
    'dependency': 'dep',
    'dependencies': 'deps',
    'development': 'dev',
    'production': 'prod',
    'information': 'info',
    'component': 'comp',
    'components': 'comps',
  };

  let result = text;
  for (const [full, abbr] of Object.entries(abbreviations)) {
    result = result.replace(new RegExp(`\\b${full}\\b`, 'gi'), abbr);
  }

  return result;
}

/**
 * Remove redundant phrases
 */
function removeRedundancy(text: string): string {
  // Remove repeated consecutive words
  let result = text.replace(/\b(\w+)\s+\1\b/gi, '$1');

  // Remove unnecessary qualifiers
  result = result.replace(/\b(very|extremely|highly|really|quite)\s+(important|critical|essential)\b/gi, 'key');

  // Combine split sentences
  result = result.replace(/\.\s+(And|But|So|Then)\s+/gi, '. ');

  return result;
}

/**
 * Preserve specified keywords
 */
function ensureKeywordsPreserved(
  original: string,
  compressed: string,
  keywords: string[]
): string {
  const missing: string[] = [];

  for (const keyword of keywords) {
    if (
      original.toLowerCase().includes(keyword.toLowerCase()) &&
      !compressed.toLowerCase().includes(keyword.toLowerCase())
    ) {
      missing.push(keyword);
    }
  }

  if (missing.length > 0) {
    return `${compressed} [Keywords: ${missing.join(', ')}]`;
  }

  return compressed;
}

/**
 * Compress content using heuristics
 */
function compressHeuristic(content: string, config: Required<CompressionConfig>): CompressionResult {
  const originalTokens = estimateTokens(content);

  // Step 1: Remove filler
  let compressed = removeFiller(content);

  // Step 2: Abbreviate
  compressed = abbreviate(compressed);

  // Step 3: Remove redundancy
  compressed = removeRedundancy(compressed);

  // Step 4: Extract key sentences if still too long
  const currentRatio = estimateTokens(compressed) / originalTokens;
  if (currentRatio > config.targetRatio * 1.5) {
    const keySentences = extractKeySentences(content, 5);
    compressed = keySentences.join(' ');
  }

  // Step 5: Ensure keywords preserved
  compressed = ensureKeywordsPreserved(content, compressed, config.preserveKeywords);

  // Step 6: Truncate if exceeds max length
  if (compressed.length > config.maxOutputLength) {
    compressed = compressed.slice(0, config.maxOutputLength - 3) + '...';
  }

  const compressedTokens = estimateTokens(compressed);

  return {
    compressed,
    preservedElements: extractKeyElements(content),
    compressionRatio: compressedTokens / originalTokens,
    originalTokens,
    compressedTokens,
  };
}

/**
 * Extract key elements that should be preserved
 */
function extractKeyElements(text: string): string[] {
  const elements: string[] = [];

  // File paths
  const files = text.match(/[\w\/\-\.]+\.[a-z]{2,4}/gi);
  if (files) elements.push(...files);

  // Function/method names
  const functions = text.match(/\b[a-z]\w+\s*\(/gi);
  if (functions) {
    elements.push(...functions.map((f) => f.replace(/\s*\($/, '')));
  }

  // Technical terms (CamelCase or UPPER_CASE)
  const terms = text.match(/\b[A-Z][a-z]+[A-Z]\w*\b|\b[A-Z]{2,}\b/g);
  if (terms) elements.push(...terms);

  // Numbers with context
  const numbers = text.match(/\b\d+(\.\d+)?\s*[a-z]+\b/gi);
  if (numbers) elements.push(...numbers);

  return [...new Set(elements)].slice(0, 10);
}

/**
 * Compress content using LLM
 */
async function compressWithLLM(
  content: string,
  config: Required<CompressionConfig>
): Promise<CompressionResult> {
  const originalTokens = estimateTokens(content);

  const prompt = COMPRESSION_PROMPT.replace('{content}', content);

  interface LLMCompressionResult {
    compressed: string;
    preservedElements: string[];
    compressionRatio: number;
  }

  const result = await analyze<LLMCompressionResult>(
    prompt,
    `Target compression: ${config.targetRatio * 100}% of original.` +
      (config.preserveKeywords.length > 0
        ? ` Must preserve: ${config.preserveKeywords.join(', ')}`
        : '')
  );

  let compressed = result.data.compressed;

  // Ensure max length
  if (compressed.length > config.maxOutputLength) {
    compressed = compressed.slice(0, config.maxOutputLength - 3) + '...';
  }

  const compressedTokens = estimateTokens(compressed);

  return {
    compressed,
    preservedElements: result.data.preservedElements || [],
    compressionRatio: compressedTokens / originalTokens,
    originalTokens,
    compressedTokens,
  };
}

/**
 * Compress content optimally
 */
export async function compressContent(
  content: string,
  config: CompressionConfig = {}
): Promise<CompressionResult> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  // For short content, use heuristics only
  if (content.length < 500) {
    return compressHeuristic(content, fullConfig);
  }

  // Try LLM compression
  try {
    return await compressWithLLM(content, fullConfig);
  } catch (error) {
    console.warn('LLM compression failed, using heuristics:', error);
    return compressHeuristic(content, fullConfig);
  }
}

/**
 * Compress content synchronously using heuristics
 */
export function compressContentSync(
  content: string,
  config: CompressionConfig = {}
): CompressionResult {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  return compressHeuristic(content, fullConfig);
}

/**
 * Compress multiple pieces of content
 */
export async function compressBatch(
  contents: string[],
  config: CompressionConfig = {}
): Promise<CompressionResult[]> {
  return Promise.all(contents.map((content) => compressContent(content, config)));
}

/**
 * Get compression summary
 */
export function getCompressionSummary(result: CompressionResult): string {
  const savingsPercent = ((1 - result.compressionRatio) * 100).toFixed(1);
  return `Compressed from ${result.originalTokens} to ${result.compressedTokens} tokens (${savingsPercent}% savings). ` +
    `Preserved ${result.preservedElements.length} key elements.`;
}
