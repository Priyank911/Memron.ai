import type { MemorySearchResult } from '@memron/shared-types';

/**
 * ContextInjector — Solves 'context rot' and the 'needle in a haystack' problem.
 * Selectively injects ONLY the exact relevant context slices into the
 * active inference window, not entire conversation histories.
 */
export class ContextInjector {
  constructor(
    private maxTokens: number = 128000,
    private reservedTokens: number = 4000, // Reserve for system prompt + response
  ) {}

  /** Given search results, build the optimal context injection payload */
  buildInjection(
    results: MemorySearchResult[],
    currentWindowTokens: number,
  ): ContextInjection {
    const available = this.maxTokens - this.reservedTokens - currentWindowTokens;
    const slices: InjectedSlice[] = [];
    let usedTokens = 0;

    // Sort by relevance, inject highest-relevance slices first
    const sorted = [...results].sort((a, b) => b.relevanceScore - a.relevanceScore);

    for (const result of sorted) {
      const sliceTokens = this.estimateTokens(result.contextSlice);
      if (usedTokens + sliceTokens > available) break;

      slices.push({
        storageId: result.record.storageId,
        bucket: result.record.bucket,
        relevance: result.relevanceScore,
        content: result.contextSlice,
        tokens: sliceTokens,
      });
      usedTokens += sliceTokens;
    }

    return {
      slices,
      totalTokens: usedTokens,
      availableTokens: available,
      injectionRatio: usedTokens / available,
    };
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}

export interface InjectedSlice {
  storageId: string;
  bucket: string;
  relevance: number;
  content: string;
  tokens: number;
}

export interface ContextInjection {
  slices: InjectedSlice[];
  totalTokens: number;
  availableTokens: number;
  injectionRatio: number;
}
