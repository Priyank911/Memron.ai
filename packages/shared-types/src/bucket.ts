/**
 * Bucket — thematic memory partitioning for organized context.
 * Solves 'needle in a haystack' by pre-categorizing memories.
 */
export interface BucketDefinition {
  id: string;
  name: string;
  description: string;
  /** Automatic classification rules */
  classificationRules: ClassificationRule[];
  /** Max memories before auto-archival */
  maxCapacity: number;
  /** Current memory count */
  currentCount: number;
  /** Priority for context injection (higher = injected first) */
  priority: number;
}

export interface ClassificationRule {
  /** Rule type */
  type: 'keyword' | 'regex' | 'semantic' | 'tool-name';
  /** Pattern or threshold */
  pattern: string;
  /** Confidence threshold for semantic rules (0-1) */
  confidence?: number;
}

export interface BucketStats {
  bucketId: string;
  totalMemories: number;
  totalTokens: number;
  avgRelevanceScore: number;
  lastUpdated: string; // RFC3339
}
