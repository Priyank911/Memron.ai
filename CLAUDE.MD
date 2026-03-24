# Memron.ai - Project Context for Claude Code

## What is Memron.ai?

Memron.ai is a **Context Intelligence & Memory Orchestration Layer** for AI agents. It turns raw AI interaction history into structured, transferable memory packets that help agents:
- Continue tasks across sessions
- Personalize outputs based on user preferences
- Reduce token waste by 90%
- Avoid repeating past mistakes

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 22+, TypeScript 5.6+ |
| Package Manager | pnpm with workspaces |
| Build | Turborepo |
| Database | PostgreSQL with pgvector |
| LLM | Groq (llama-3.3-70b-versatile) |
| Protocol | Model Context Protocol (MCP) |
| Testing | Vitest |

---

## Project Structure

```
Memron.ai/
├── packages/
│   ├── analysis-engine/     # Core analysis & extraction (NEW)
│   ├── shared-types/        # Shared TypeScript types
│   ├── mcp-bridge/          # MCP SDK wrapper
│   ├── memory-core/         # Memory operations
│   ├── trust-registry/      # Trust & sharing policies
│   └── ui/                  # Shared UI components
├── services/
│   ├── mcp-server/          # MCP server implementation
│   └── web-dashboard/       # Next.js dashboard
├── apps/
│   ├── dashboard/           # Main dashboard app
│   └── playground/          # Testing playground
├── PLAN.md                  # Implementation plan & status
└── CLAUDE.MD                # This file
```

---

## Key Concepts

### 7-Layer Memory Architecture
1. **Working Memory** - Current session state
2. **Episodic Memory** - Conversation episodes and task attempts
3. **Semantic Memory** - Stable facts, preferences, patterns
4. **Procedural Memory** - How-to recipes, workflows
5. **Evaluative Memory** - Failure cases, hallucination triggers
6. **Social/Shareable Memory** - Transferable across agents
7. **Archive/Raw Trace** - Original conversations for audit

### Memory Types
| Type | Description | Example |
|------|-------------|---------|
| `fact` | Factual information | "API uses JWT tokens" |
| `goal` | User objectives | "Build a login system" |
| `constraint` | Limitations | "Must be under 100 lines" |
| `preference` | User preferences | "Prefers TypeScript" |
| `attempted_action` | Actions taken | "Tried bubble sort first" |
| `observed_failure` | Failures | "OAuth redirect failed" |
| `observed_success` | Successes | "JWT implementation worked" |
| `final_resolution` | Final solutions | "Used passport.js with JWT" |

### Episode Types
| Type | Description |
|------|-------------|
| `goal_definition` | Initial goal setting |
| `planning` | Planning discussions |
| `execution` | Action execution |
| `troubleshooting` | Problem solving |
| `verification` | Result verification |
| `conclusion` | Wrap-up |

---

## Analysis Engine Package

Located at `packages/analysis-engine/`, this is the core intelligence layer.

### Main Pipeline
```typescript
import { runPipeline } from '@memron/analysis-engine';

const result = await runPipeline({
  sessionId: 'session_123',
  userId: 'user_456',
  messages: [...conversationMessages],
});

// Returns:
// - episodes: Semantic conversation segments
// - memories: Extracted knowledge units
// - analyses: Trajectory analysis results
// - recipes: Distilled success patterns
// - entities: Knowledge graph nodes
// - relationships: Knowledge graph edges
```

### Key Functions
| Function | Description |
|----------|-------------|
| `splitIntoEpisodes()` | Break conversation into episodes |
| `extractMemories()` | Extract atomic memory units |
| `analyzeTrajectory()` | Analyze success/failure paths |
| `distillRecipe()` | Create reusable success recipe |
| `extractEntities()` | Build knowledge graph |
| `detectConflict()` | Find memory contradictions |
| `buildMemoryPacket()` | Create context for retrieval |

### Sync vs Async
Most functions have both versions:
- `extractMemories()` - Uses Groq LLM for enhanced analysis
- `extractMemoriesSync()` - Heuristic-only, no LLM calls

---

## MCP Tools (30+)

### Core Tools (existing)
- `memory_store`, `memory_search`, `memory_update`, `memory_delete`
- `profile_get`, `profile_update`
- `context_build`
- `system_health`, `system_stats`

### Analysis Tools (new)
```typescript
// Full ingestion with analysis and storage
memory_ingest({ messages: [...], userId: 1, options: { useLLM: true } })

// Quick analysis without storage
memory_analyze({ messages: [...], quick: true })
```

### Recipe Tools (new)
```typescript
recipe_search({ taskType: 'authentication', minSuccessRate: 0.7 })
recipe_create({ recipeName: '...', approach: [...] })
recipe_feedback({ recipeId: '...', feedback: 'positive' })
recipe_get({ recipeId: '...' })
```

### Context Packet Tools (new)
```typescript
// Build anti-hallucination memory packet
context_packet({ query: 'Fix auth bug', tokenBudget: 500 })

// Format for direct prompt injection
context_packet_format({ query: '...' })
```

### Knowledge Graph Tools (new)
```typescript
graph_query({ entityName: 'React', depth: 2 })
graph_paths({ fromEntity: 'React', toEntity: 'TypeScript' })
graph_hubs({ limit: 10 })
graph_add_entity({ name: 'Vue', type: 'technology' })
graph_add_relationship({ source: 'Vue', target: 'JavaScript', type: 'uses' })
```

### Versioning Tools (new)
```typescript
prompt_version_create({ templateId: '...', rawText: '...' })
prompt_version_compare({ versionIdA: '...', versionIdB: '...' })
run_record({ sessionId: '...', inputTokens: 500, successScore: 0.9 })
run_feedback({ runId: '...', feedback: 'positive' })
```

---

## Database Schema (11 tables)

| Table | Purpose |
|-------|---------|
| `episodes` | Conversation segments |
| `atomic_memories` | Structured knowledge + embeddings |
| `success_recipes` | Distilled winning strategies |
| `failure_patterns` | What to avoid |
| `entities` | Knowledge graph nodes |
| `entity_relationships` | Knowledge graph edges |
| `prompt_templates` | Prompt definitions |
| `prompt_versions` | Version tracking |
| `prompt_diffs` | Semantic changes |
| `run_records` | Execution tracking |
| `memory_packets` | Cached context packets |

---

## Common Commands

```bash
# Development
pnpm dev                              # Start all services
pnpm --filter @memron/mcp-server dev  # Start MCP server only
pnpm build                            # Build all packages

# Testing
pnpm test                                      # Run all tests
pnpm --filter @memron/analysis-engine test     # Test analysis engine

# Database
pnpm --filter @memron/mcp-server db:migrate           # Run base migrations
pnpm --filter @memron/mcp-server db:migrate:analysis  # Run analysis migrations

# Type checking
pnpm typecheck                        # Check all packages
```

---

## Environment Variables

```env
# Required
DATABASE_URL=postgresql://user:pass@host:5432/memron
GROQ_API_KEY=gsk_...

# Optional
NEXT_PUBLIC_API_URL=http://localhost:5201
JWT_SECRET=your-secret-key
```

---

## Code Patterns

### Adding a new MCP tool
```typescript
// In services/mcp-server/src/tools/your-tool.ts
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const InputSchema = z.object({
  userId: z.number(),
  // ... other fields
});

export function registerYourTools(server: McpServer): void {
  server.tool(
    'tool_name',
    'Tool description',
    InputSchema.shape,
    async (params) => {
      const input = InputSchema.parse(params);
      // ... implementation
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      };
    }
  );
}

// Then register in tools/index.ts
```

### Error Handling
```typescript
import { McpError, ErrorCode } from '../lib/errors.js';

if (!found) {
  throw new McpError(ErrorCode.NotFound, 'Resource not found');
}
```

### Database Queries
```typescript
// In services/mcp-server/src/db/queries-analysis.ts
import { query } from './client.js';

export async function getById(id: string): Promise<Row | null> {
  const result = await query<Row>(
    `SELECT * FROM table WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}
```

---

## Testing

Tests use Vitest with the following patterns:

```typescript
import { describe, it, expect } from 'vitest';

describe('ComponentName', () => {
  it('should do something', () => {
    // Arrange
    const input = createTestInput();

    // Act
    const result = functionUnderTest(input);

    // Assert
    expect(result).toBeDefined();
  });
});
```

Run specific test patterns:
```bash
pnpm --filter @memron/analysis-engine test:episodes
pnpm --filter @memron/analysis-engine test:extraction
pnpm --filter @memron/analysis-engine test:analysis
pnpm --filter @memron/analysis-engine test:distill
```

---

## Quick Reference

### File Locations
| What | Where |
|------|-------|
| Analysis types | `packages/analysis-engine/src/types.ts` |
| LLM prompts | `packages/analysis-engine/src/llm/prompts.ts` |
| Database queries | `services/mcp-server/src/db/queries-analysis.ts` |
| MCP tool registration | `services/mcp-server/src/tools/index.ts` |
| Migration SQL | `services/mcp-server/src/db/migrations/` |

### Import Paths
```typescript
// From analysis engine
import { runPipeline, extractMemories } from '@memron/analysis-engine';

// From shared types
import type { Memory, Recipe } from '@memron/shared-types';
```

---

## Troubleshooting

### "Cannot find module @memron/analysis-engine"
Run `pnpm install` to link workspace packages.

### Database connection errors
Check `DATABASE_URL` environment variable and ensure pgvector extension is installed.

### Groq API errors
Verify `GROQ_API_KEY` is set. Use sync functions (`*Sync`) to skip LLM calls during testing.

### TypeScript path resolution
The `tsconfig.base.json` has path aliases configured. Ensure you're building with `pnpm build` before running.

---

## Manual Testing Guide

### Prerequisites
- Node.js 20+
- pnpm 9+
- Docker Desktop
- VS Code with Claude extension (for MCP testing)

### Step 1: Start Services

Open **3 terminal windows** in the project root:

**Terminal 1 - Start Docker (Database + Redis):**
```bash
docker compose -f infra/docker/docker-compose.yml up
```
Wait for: `database system is ready to accept connections`

**Terminal 2 - Start MCP Server:**
```bash
pnpm --filter @memron/mcp-server dev
```
Wait for: `MCP server listening on port 5201`

**Terminal 3 - Start Landing Page:**
```bash
pnpm dev:landing
```
Wait for: `Ready on http://localhost:3000`

### Step 2: Visual Testing (Browser)

| URL | Expected |
|-----|----------|
| http://localhost:3000 | Landing page with navigation |
| http://localhost:5201/health | JSON: `{"status":"healthy",...}` |

### Step 3: VS Code + Claude MCP Testing

**Option A: VS Code settings.json**
```json
{
  "claude.mcpServers": {
    "memron": {
      "url": "http://localhost:5201/mcp",
      "headers": {
        "Authorization": "Bearer test-api-key"
      }
    }
  }
}
```

**Option B: Workspace config** - Create `.vscode/mcp.json`:
```json
{
  "mcpServers": {
    "memron": {
      "url": "http://localhost:5201/mcp",
      "headers": {
        "Authorization": "Bearer test-api-key"
      }
    }
  }
}
```

### Step 4: Test MCP Tools

Once connected to Claude in VS Code, try:

1. **Memory ingestion:** `Use memron's memory_ingest tool to store a test conversation`
2. **Recipe search:** `Search for recipes using recipe_search with taskType "debugging"`
3. **Context packet:** `Build a context packet for query "implement authentication"`
4. **Knowledge graph:** `Query the knowledge graph for entity "TypeScript"`

### Step 5: Test Database

```bash
# Connect to PostgreSQL
docker exec -it memron-postgres psql -U memron -d memron

# List tables (should see 11+ tables)
\dt

# Exit
\q
```

### Step 6: Run Tests

```bash
# All tests
pnpm test

# Specific packages
pnpm --filter @memron/analysis-engine test
pnpm --filter @memron/mcp-server test
```

### Step 7: Stop Services

```bash
# Ctrl+C in each terminal, or:
docker compose -f infra/docker/docker-compose.yml down
```

### Quick Health Check

```bash
curl http://localhost:5201/health
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
docker ps
```

---

## Test Results Summary

| Package | Tests | Status |
|---------|-------|--------|
| analysis-engine | 92 passed, 2 skipped | ✅ |
| mcp-server | 65 passed | ✅ |
| mcp-bridge | 3 passed | ✅ |
| **Total** | **160 passed** | ✅ |

---

## Implementation Status

All 9 blocks from PLAN.md are implemented:

1. ✅ Episode Decomposition
2. ✅ Atomic Memory Extraction
3. ✅ Trajectory Analysis
4. ✅ Recipe Distillation
5. ✅ Prompt Versioning
6. ✅ Knowledge Graph
7. ✅ Memory Evolution
8. ✅ Anti-Hallucination Retrieval
9. ✅ MCP Tools (30+)
