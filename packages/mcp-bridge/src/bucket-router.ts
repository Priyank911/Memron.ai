import type { BucketDefinition, ClassificationRule, MemoryBucket } from '@memron/shared-types';

/**
 * BucketRouter — Routes incoming memories to the correct thematic bucket
 * based on classification rules (keyword, regex, semantic, tool-name).
 */
export class BucketRouter {
  private buckets: Map<string, BucketDefinition> = new Map();

  constructor() {
    this.initializeDefaultBuckets();
  }

  /** Classify content and return the best-matching bucket */
  classify(content: string, toolName?: string): MemoryBucket {
    if (toolName) {
      return 'tool-results';
    }

    for (const [, bucket] of this.buckets) {
      for (const rule of bucket.classificationRules) {
        if (this.matchesRule(content, rule)) {
          return bucket.id as MemoryBucket;
        }
      }
    }

    return 'conversation'; // default bucket
  }

  /** Add or update a bucket definition */
  registerBucket(bucket: BucketDefinition): void {
    this.buckets.set(bucket.id, bucket);
  }

  /** Get all registered buckets */
  getBuckets(): BucketDefinition[] {
    return Array.from(this.buckets.values());
  }

  private matchesRule(content: string, rule: ClassificationRule): boolean {
    switch (rule.type) {
      case 'keyword':
        return content.toLowerCase().includes(rule.pattern.toLowerCase());
      case 'regex':
        return new RegExp(rule.pattern, 'i').test(content);
      case 'semantic':
        // TODO: Integrate embedding-based classification
        return false;
      case 'tool-name':
        return false; // Handled separately
      default:
        return false;
    }
  }

  private initializeDefaultBuckets(): void {
    const defaults: BucketDefinition[] = [
      {
        id: 'conversation',
        name: 'Conversation',
        description: 'General conversation context and dialogue history',
        classificationRules: [],
        maxCapacity: 10000,
        currentCount: 0,
        priority: 1,
      },
      {
        id: 'tool-results',
        name: 'Tool Results',
        description: 'Outputs from tool executions',
        classificationRules: [{ type: 'tool-name', pattern: '*' }],
        maxCapacity: 5000,
        currentCount: 0,
        priority: 2,
      },
      {
        id: 'preferences',
        name: 'Preferences',
        description: 'User preferences, settings, behavioral patterns',
        classificationRules: [
          { type: 'keyword', pattern: 'prefer' },
          { type: 'keyword', pattern: 'setting' },
          { type: 'keyword', pattern: 'always' },
        ],
        maxCapacity: 1000,
        currentCount: 0,
        priority: 3,
      },
      {
        id: 'knowledge',
        name: 'Knowledge',
        description: 'Facts, documentation, learned information',
        classificationRules: [
          { type: 'keyword', pattern: 'documentation' },
          { type: 'keyword', pattern: 'reference' },
        ],
        maxCapacity: 20000,
        currentCount: 0,
        priority: 2,
      },
    ];

    for (const bucket of defaults) {
      this.buckets.set(bucket.id, bucket);
    }
  }
}
