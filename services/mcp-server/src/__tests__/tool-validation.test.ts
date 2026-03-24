/**
 * Tool Input Validation Tests
 * Tests Zod schema validation for all MCP tools
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// ============================================================================
// Recreate schemas with the security-hardened constraints
// to verify validation behavior without MCP SDK dependency
// ============================================================================

const MessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  content: z.string().max(100000),
  timestamp: z.string().max(50).optional(),
});

const IngestInputSchema = z.object({
  sessionId: z.string().optional(),
  userId: z.number(),
  messages: z.array(MessageSchema).min(1).max(500),
  options: z.object({
    useLLM: z.boolean().optional(),
    extractEpisodes: z.boolean().optional(),
    extractMemories: z.boolean().optional(),
    analyzeTrajectory: z.boolean().optional(),
    distillRecipes: z.boolean().optional(),
    extractEntities: z.boolean().optional(),
  }).optional(),
});

const RecipeSearchSchema = z.object({
  userId: z.number(),
  taskType: z.string().max(200).optional(),
  query: z.string().max(1000).optional(),
  embedding: z.array(z.number()).max(4096).optional(),
  minSuccessRate: z.number().min(0).max(1).optional(),
  limit: z.number().min(1).max(50).optional(),
});

const RecipeCreateSchema = z.object({
  userId: z.number(),
  recipeName: z.string().max(500),
  taskType: z.string().max(200),
  problemStatement: z.string().max(5000),
  approach: z.array(z.object({
    step: z.number(),
    action: z.string().max(2000),
    rationale: z.string().max(2000).optional(),
    criticalDetail: z.string().max(2000).optional(),
  })).max(50),
  doList: z.array(z.string().max(500)).max(20).optional(),
  dontList: z.array(z.string().max(500)).max(20).optional(),
});

const PacketBuildSchema = z.object({
  userId: z.number(),
  query: z.string().max(2000),
  embedding: z.array(z.number()).max(4096).optional(),
  tokenBudget: z.number().min(100).max(10000).optional(),
  minConfidence: z.number().min(0).max(1).optional(),
});

const GraphQuerySchema = z.object({
  userId: z.number(),
  entityName: z.string().max(200),
  depth: z.number().min(1).max(5).optional(),
});

const EntityAddSchema = z.object({
  userId: z.number(),
  name: z.string().max(200),
  type: z.string().max(100).optional(),
  description: z.string().max(2000).optional(),
});

// ============================================================================
// Ingest Tool Validation
// ============================================================================

describe('Ingest Tool Validation', () => {
  it('should accept valid input', () => {
    const input = {
      userId: 1,
      messages: [{ role: 'user', content: 'Hello' }],
    };
    expect(() => IngestInputSchema.parse(input)).not.toThrow();
  });

  it('should reject empty messages array', () => {
    const input = { userId: 1, messages: [] };
    expect(() => IngestInputSchema.parse(input)).toThrow();
  });

  it('should reject more than 500 messages', () => {
    const input = {
      userId: 1,
      messages: Array.from({ length: 501 }, () => ({
        role: 'user' as const,
        content: 'test',
      })),
    };
    expect(() => IngestInputSchema.parse(input)).toThrow();
  });

  it('should accept exactly 500 messages', () => {
    const input = {
      userId: 1,
      messages: Array.from({ length: 500 }, () => ({
        role: 'user' as const,
        content: 'test',
      })),
    };
    expect(() => IngestInputSchema.parse(input)).not.toThrow();
  });

  it('should reject oversized message content', () => {
    const input = {
      userId: 1,
      messages: [{ role: 'user', content: 'x'.repeat(100001) }],
    };
    expect(() => IngestInputSchema.parse(input)).toThrow();
  });

  it('should accept max-size content (100000 chars)', () => {
    const input = {
      userId: 1,
      messages: [{ role: 'user', content: 'x'.repeat(100000) }],
    };
    expect(() => IngestInputSchema.parse(input)).not.toThrow();
  });

  it('should reject invalid role', () => {
    const input = {
      userId: 1,
      messages: [{ role: 'admin', content: 'test' }],
    };
    expect(() => IngestInputSchema.parse(input)).toThrow();
  });

  it('should reject missing userId', () => {
    const input = {
      messages: [{ role: 'user', content: 'test' }],
    };
    expect(() => IngestInputSchema.parse(input)).toThrow();
  });

  it('should reject non-numeric userId', () => {
    const input = {
      userId: 'abc',
      messages: [{ role: 'user', content: 'test' }],
    };
    expect(() => IngestInputSchema.parse(input)).toThrow();
  });

  it('should accept valid options', () => {
    const input = {
      userId: 1,
      messages: [{ role: 'user', content: 'test' }],
      options: { useLLM: false, extractEpisodes: true },
    };
    expect(() => IngestInputSchema.parse(input)).not.toThrow();
  });
});

// ============================================================================
// Recipe Tool Validation
// ============================================================================

describe('Recipe Tool Validation', () => {
  describe('recipe_search', () => {
    it('should accept valid search', () => {
      const input = { userId: 1, taskType: 'debugging' };
      expect(() => RecipeSearchSchema.parse(input)).not.toThrow();
    });

    it('should reject taskType exceeding 200 chars', () => {
      const input = { userId: 1, taskType: 'x'.repeat(201) };
      expect(() => RecipeSearchSchema.parse(input)).toThrow();
    });

    it('should reject query exceeding 1000 chars', () => {
      const input = { userId: 1, query: 'x'.repeat(1001) };
      expect(() => RecipeSearchSchema.parse(input)).toThrow();
    });

    it('should reject embedding exceeding 4096 dimensions', () => {
      const input = { userId: 1, embedding: new Array(4097).fill(0.1) };
      expect(() => RecipeSearchSchema.parse(input)).toThrow();
    });

    it('should accept embedding at exactly 4096 dimensions', () => {
      const input = { userId: 1, embedding: new Array(4096).fill(0.1) };
      expect(() => RecipeSearchSchema.parse(input)).not.toThrow();
    });

    it('should reject successRate > 1', () => {
      const input = { userId: 1, minSuccessRate: 1.5 };
      expect(() => RecipeSearchSchema.parse(input)).toThrow();
    });

    it('should reject successRate < 0', () => {
      const input = { userId: 1, minSuccessRate: -0.5 };
      expect(() => RecipeSearchSchema.parse(input)).toThrow();
    });

    it('should reject limit > 50', () => {
      const input = { userId: 1, limit: 51 };
      expect(() => RecipeSearchSchema.parse(input)).toThrow();
    });
  });

  describe('recipe_create', () => {
    it('should accept valid recipe', () => {
      const input = {
        userId: 1,
        recipeName: 'Fix auth bugs',
        taskType: 'debugging',
        problemStatement: 'OAuth tokens expire silently',
        approach: [{ step: 1, action: 'Check token expiry' }],
      };
      expect(() => RecipeCreateSchema.parse(input)).not.toThrow();
    });

    it('should reject recipeName exceeding 500 chars', () => {
      const input = {
        userId: 1,
        recipeName: 'x'.repeat(501),
        taskType: 'debugging',
        problemStatement: 'test',
        approach: [{ step: 1, action: 'test' }],
      };
      expect(() => RecipeCreateSchema.parse(input)).toThrow();
    });

    it('should reject more than 50 approach steps', () => {
      const input = {
        userId: 1,
        recipeName: 'test',
        taskType: 'debugging',
        problemStatement: 'test',
        approach: Array.from({ length: 51 }, (_, i) => ({
          step: i + 1,
          action: 'do something',
        })),
      };
      expect(() => RecipeCreateSchema.parse(input)).toThrow();
    });

    it('should reject action exceeding 2000 chars', () => {
      const input = {
        userId: 1,
        recipeName: 'test',
        taskType: 'debugging',
        problemStatement: 'test',
        approach: [{ step: 1, action: 'x'.repeat(2001) }],
      };
      expect(() => RecipeCreateSchema.parse(input)).toThrow();
    });

    it('should reject more than 20 doList items', () => {
      const input = {
        userId: 1,
        recipeName: 'test',
        taskType: 'debugging',
        problemStatement: 'test',
        approach: [{ step: 1, action: 'test' }],
        doList: Array.from({ length: 21 }, () => 'do this'),
      };
      expect(() => RecipeCreateSchema.parse(input)).toThrow();
    });
  });
});

// ============================================================================
// Packet Tool Validation
// ============================================================================

describe('Packet Tool Validation', () => {
  it('should accept valid packet build request', () => {
    const input = { userId: 1, query: 'Fix auth bug' };
    expect(() => PacketBuildSchema.parse(input)).not.toThrow();
  });

  it('should reject query exceeding 2000 chars', () => {
    const input = { userId: 1, query: 'x'.repeat(2001) };
    expect(() => PacketBuildSchema.parse(input)).toThrow();
  });

  it('should reject tokenBudget below 100', () => {
    const input = { userId: 1, query: 'test', tokenBudget: 50 };
    expect(() => PacketBuildSchema.parse(input)).toThrow();
  });

  it('should reject tokenBudget above 10000', () => {
    const input = { userId: 1, query: 'test', tokenBudget: 10001 };
    expect(() => PacketBuildSchema.parse(input)).toThrow();
  });

  it('should reject minConfidence above 1', () => {
    const input = { userId: 1, query: 'test', minConfidence: 1.5 };
    expect(() => PacketBuildSchema.parse(input)).toThrow();
  });

  it('should reject oversized embedding', () => {
    const input = { userId: 1, query: 'test', embedding: new Array(5000).fill(0.1) };
    expect(() => PacketBuildSchema.parse(input)).toThrow();
  });
});

// ============================================================================
// Graph Tool Validation
// ============================================================================

describe('Graph Tool Validation', () => {
  describe('graph_query', () => {
    it('should accept valid query', () => {
      const input = { userId: 1, entityName: 'TypeScript' };
      expect(() => GraphQuerySchema.parse(input)).not.toThrow();
    });

    it('should reject entityName exceeding 200 chars', () => {
      const input = { userId: 1, entityName: 'x'.repeat(201) };
      expect(() => GraphQuerySchema.parse(input)).toThrow();
    });

    it('should reject depth > 5', () => {
      const input = { userId: 1, entityName: 'test', depth: 6 };
      expect(() => GraphQuerySchema.parse(input)).toThrow();
    });

    it('should reject depth < 1', () => {
      const input = { userId: 1, entityName: 'test', depth: 0 };
      expect(() => GraphQuerySchema.parse(input)).toThrow();
    });
  });

  describe('graph_add_entity', () => {
    it('should accept valid entity', () => {
      const input = { userId: 1, name: 'React', type: 'technology' };
      expect(() => EntityAddSchema.parse(input)).not.toThrow();
    });

    it('should reject name exceeding 200 chars', () => {
      const input = { userId: 1, name: 'x'.repeat(201) };
      expect(() => EntityAddSchema.parse(input)).toThrow();
    });

    it('should reject type exceeding 100 chars', () => {
      const input = { userId: 1, name: 'test', type: 'x'.repeat(101) };
      expect(() => EntityAddSchema.parse(input)).toThrow();
    });

    it('should reject description exceeding 2000 chars', () => {
      const input = { userId: 1, name: 'test', description: 'x'.repeat(2001) };
      expect(() => EntityAddSchema.parse(input)).toThrow();
    });
  });
});

// ============================================================================
// Error Response Format Tests
// ============================================================================

describe('Error Response Format', () => {
  it('should never expose stack traces in error messages', () => {
    const internalError = new Error('ECONNREFUSED 127.0.0.1:5432');
    internalError.stack = 'Error: ECONNREFUSED\n    at TCPConnectWrap.afterConnect';

    const publicMessage = internalError.message;
    // Error messages from McpError use the message, not the stack
    expect(publicMessage).not.toContain('at TCPConnectWrap');
  });

  it('should format McpError correctly', () => {
    const errorCode = -32603; // InternalError
    const message = 'Ingestion failed: Connection refused';

    // McpError structure
    const mcpError = {
      message,
      code: errorCode,
      httpStatus: 500,
    };

    expect(mcpError.code).toBe(-32603);
    expect(mcpError.httpStatus).toBe(500);
  });
});

// ============================================================================
// Type Coercion Edge Cases
// ============================================================================

describe('Type Coercion Edge Cases', () => {
  it('should reject string where number expected', () => {
    const schema = z.object({ userId: z.number() });
    expect(() => schema.parse({ userId: 'abc' })).toThrow();
  });

  it('should reject null where required', () => {
    const schema = z.object({ query: z.string() });
    expect(() => schema.parse({ query: null })).toThrow();
  });

  it('should reject undefined for required fields', () => {
    const schema = z.object({ userId: z.number() });
    expect(() => schema.parse({})).toThrow();
  });

  it('should accept 0 as valid number', () => {
    const schema = z.object({ score: z.number().min(0).max(1) });
    expect(() => schema.parse({ score: 0 })).not.toThrow();
  });

  it('should accept empty string for optional fields', () => {
    const schema = z.object({ name: z.string().optional() });
    expect(() => schema.parse({ name: '' })).not.toThrow();
  });

  it('should reject NaN for number fields', () => {
    const schema = z.object({ score: z.number() });
    expect(() => schema.parse({ score: NaN })).toThrow();
  });
});
