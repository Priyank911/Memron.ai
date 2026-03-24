/**
 * Atomic Memory Extractor
 * Extracts structured memory units from conversation episodes
 */

import { nanoid } from 'nanoid';
import { analyze } from '../llm/groq-client.js';
import { MEMORY_EXTRACTION_PROMPT } from '../llm/prompts.js';
import type {
  AtomicMemoryUnit,
  ConversationMessage,
  Episode,
  MemoryType,
  EntityLink,
} from '../types.js';

export interface AtomicExtractorConfig {
  minConfidence?: number;
  maxMemoriesPerEpisode?: number;
  generateEmbeddings?: boolean;
}

interface LLMMemoryResult {
  memories: Array<{
    memoryType: MemoryType;
    content: string;
    compressedContent: string;
    confidence: number;
    successScore: number;
    failureScore: number;
    transferability: number;
    sourceSpan: { start: number; end: number };
  }>;
}

const DEFAULT_CONFIG: Required<AtomicExtractorConfig> = {
  minConfidence: 0.5,
  maxMemoriesPerEpisode: 20,
  generateEmbeddings: false,
};

/**
 * Estimate token count for text
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Format episode content for LLM analysis
 */
function formatEpisodeForExtraction(episode: Episode): string {
  return episode.messages
    .map((m, i) => {
      let prefix = `[${i}] ${m.role}`;
      if (m.toolName) prefix += ` (${m.toolName})`;
      return `${prefix}: ${m.content}`;
    })
    .join('\n\n');
}

/**
 * Extract memory type from content heuristically
 */
function inferMemoryType(
  content: string,
  role: string
): { type: MemoryType; confidence: number } {
  const lowerContent = content.toLowerCase();

  // Check for explicit preference statements
  if (
    /\b(i prefer|i like|i want|i need|don't like|avoid)\b/.test(lowerContent) &&
    role === 'user'
  ) {
    return { type: 'preference', confidence: 0.85 };
  }

  // Check for constraints
  if (
    /\b(must|should|cannot|shouldn't|required|forbidden|limitation)\b/.test(lowerContent)
  ) {
    return { type: 'constraint', confidence: 0.75 };
  }

  // Check for goals
  if (/\b(goal is|trying to|want to achieve|task is)\b/.test(lowerContent)) {
    return { type: 'goal', confidence: 0.8 };
  }

  // Check for actions
  if (/\b(i will|let me|going to|implementing|creating)\b/.test(lowerContent)) {
    return { type: 'attempted_action', confidence: 0.7 };
  }

  // Check for failures
  if (/\b(error|failed|doesn't work|broken|wrong|incorrect)\b/.test(lowerContent)) {
    return { type: 'observed_failure', confidence: 0.8 };
  }

  // Check for success
  if (
    /\b(works|success|solved|fixed|perfect|complete|done)\b/.test(lowerContent) &&
    role === 'user'
  ) {
    return { type: 'observed_success', confidence: 0.8 };
  }

  // Check for resolution
  if (
    /\b(the solution is|here's how|the fix is|final version)\b/.test(lowerContent) &&
    role === 'assistant'
  ) {
    return { type: 'final_resolution', confidence: 0.75 };
  }

  // Default to fact
  return { type: 'fact', confidence: 0.5 };
}

/**
 * Compress content while preserving key information
 */
function compressContent(content: string): string {
  // Remove excessive whitespace
  let compressed = content.replace(/\s+/g, ' ').trim();

  // Remove common filler phrases
  const fillers = [
    /\b(basically|essentially|actually|really|very|quite|just|simply)\b/gi,
    /\b(as you can see|as mentioned|in other words)\b/gi,
  ];

  for (const filler of fillers) {
    compressed = compressed.replace(filler, '');
  }

  // Clean up extra spaces
  compressed = compressed.replace(/\s+/g, ' ').trim();

  // Truncate if still too long
  if (compressed.length > 500) {
    compressed = compressed.slice(0, 497) + '...';
  }

  return compressed;
}

/**
 * Extract memories from a single message
 */
function extractFromMessage(
  message: ConversationMessage,
  messageIndex: number,
  episodeOutcome?: string
): Partial<AtomicMemoryUnit>[] {
  const memories: Partial<AtomicMemoryUnit>[] = [];
  const { type, confidence } = inferMemoryType(message.content, message.role);

  // Skip low-confidence or very short messages
  if (confidence < 0.5 || message.content.length < 20) {
    return memories;
  }

  // Calculate scores based on message characteristics
  const isUserMessage = message.role === 'user';
  const isSuccess = episodeOutcome === 'success';
  const isFailure = episodeOutcome === 'failure';

  memories.push({
    memoryType: type,
    content: message.content,
    compressedContent: compressContent(message.content),
    confidence,
    successScore: isSuccess ? 0.8 : isUserMessage ? 0.5 : 0.6,
    failureScore: isFailure ? 0.8 : 0.2,
    transferability: type === 'preference' || type === 'constraint' ? 0.9 : 0.6,
    sourceSpan: { start: messageIndex, end: messageIndex + 1 },
  });

  return memories;
}

/**
 * Extract atomic memories using LLM
 */
async function extractWithLLM(
  episode: Episode,
  config: Required<AtomicExtractorConfig>
): Promise<Partial<AtomicMemoryUnit>[]> {
  const content = formatEpisodeForExtraction(episode);

  const result = await analyze<LLMMemoryResult>(MEMORY_EXTRACTION_PROMPT, content);

  return result.data.memories
    .filter((m) => m.confidence >= config.minConfidence)
    .slice(0, config.maxMemoriesPerEpisode);
}

/**
 * Merge and deduplicate extracted memories
 */
function deduplicateMemories(
  memories: Partial<AtomicMemoryUnit>[]
): Partial<AtomicMemoryUnit>[] {
  const seen = new Map<string, Partial<AtomicMemoryUnit>>();

  for (const memory of memories) {
    // Create a simple hash based on compressed content
    const key = memory.compressedContent?.toLowerCase().slice(0, 100) || '';

    if (!seen.has(key)) {
      seen.set(key, memory);
    } else {
      // Merge with higher confidence version
      const existing = seen.get(key)!;
      if ((memory.confidence || 0) > (existing.confidence || 0)) {
        seen.set(key, memory);
      }
    }
  }

  return Array.from(seen.values());
}

/**
 * Extract atomic memory units from an episode
 */
export async function extractMemories(
  episode: Episode,
  userId: string,
  config: AtomicExtractorConfig = {}
): Promise<AtomicMemoryUnit[]> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const timestamp = new Date().toISOString();

  // Extract using both heuristics and LLM
  const heuristicMemories: Partial<AtomicMemoryUnit>[] = [];

  for (let i = 0; i < episode.messages.length; i++) {
    const extracted = extractFromMessage(episode.messages[i], i, episode.outcome);
    heuristicMemories.push(...extracted);
  }

  let llmMemories: Partial<AtomicMemoryUnit>[] = [];
  try {
    llmMemories = await extractWithLLM(episode, fullConfig);
  } catch (error) {
    console.warn('LLM extraction failed, using heuristics only:', error);
  }

  // Merge and deduplicate
  const allMemories = deduplicateMemories([...heuristicMemories, ...llmMemories]);

  // Build full memory units
  return allMemories
    .filter((m) => m.content && m.memoryType)
    .slice(0, fullConfig.maxMemoriesPerEpisode)
    .map((m) => ({
      memoryId: `mem_${nanoid(16)}`,
      userId,
      workspaceId: undefined,
      agentId: undefined,
      taskId: undefined,
      memoryType: m.memoryType!,
      content: m.content!,
      compressedContent: m.compressedContent || compressContent(m.content!),
      confidence: m.confidence || 0.5,
      successScore: m.successScore || 0.5,
      failureScore: m.failureScore || 0.2,
      transferability: m.transferability || 0.5,
      timestamp,
      eventTime: episode.createdAt,
      validFrom: timestamp,
      validTo: undefined,
      supersedesMemoryId: undefined,
      sourceSpan: m.sourceSpan || { start: 0, end: episode.messages.length },
      graphLinks: [] as EntityLink[],
      sharePolicy: 'private' as const,
      expiry: undefined,
      embedding: undefined,
    }));
}

/**
 * Extract memories synchronously using heuristics only
 */
export function extractMemoriesSync(
  episode: Episode,
  userId: string,
  config: AtomicExtractorConfig = {}
): AtomicMemoryUnit[] {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const timestamp = new Date().toISOString();

  const heuristicMemories: Partial<AtomicMemoryUnit>[] = [];

  for (let i = 0; i < episode.messages.length; i++) {
    const extracted = extractFromMessage(episode.messages[i], i, episode.outcome);
    heuristicMemories.push(...extracted);
  }

  const deduped = deduplicateMemories(heuristicMemories);

  return deduped
    .filter((m) => m.content && m.memoryType)
    .slice(0, fullConfig.maxMemoriesPerEpisode)
    .map((m) => ({
      memoryId: `mem_${nanoid(16)}`,
      userId,
      workspaceId: undefined,
      agentId: undefined,
      taskId: undefined,
      memoryType: m.memoryType!,
      content: m.content!,
      compressedContent: m.compressedContent || compressContent(m.content!),
      confidence: m.confidence || 0.5,
      successScore: m.successScore || 0.5,
      failureScore: m.failureScore || 0.2,
      transferability: m.transferability || 0.5,
      timestamp,
      eventTime: episode.createdAt,
      validFrom: timestamp,
      validTo: undefined,
      supersedesMemoryId: undefined,
      sourceSpan: m.sourceSpan || { start: 0, end: episode.messages.length },
      graphLinks: [] as EntityLink[],
      sharePolicy: 'private' as const,
      expiry: undefined,
      embedding: undefined,
    }));
}

/**
 * Calculate compression statistics for extracted memories
 */
export function calculateCompressionStats(
  originalMessages: ConversationMessage[],
  memories: AtomicMemoryUnit[]
): {
  originalTokens: number;
  compressedTokens: number;
  compressionRatio: number;
  memoriesExtracted: number;
} {
  const originalTokens = originalMessages.reduce(
    (sum, m) => sum + estimateTokens(m.content),
    0
  );

  const compressedTokens = memories.reduce(
    (sum, m) => sum + estimateTokens(m.compressedContent),
    0
  );

  return {
    originalTokens,
    compressedTokens,
    compressionRatio: originalTokens > 0 ? 1 - compressedTokens / originalTokens : 0,
    memoriesExtracted: memories.length,
  };
}
