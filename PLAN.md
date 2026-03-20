# Memron.ai - Context Intelligence & Memory Orchestration Layer

## Status: ✅ COMPLETE

**Last Updated:** 2026-03-13

---

## Overview

Memron.ai is a **Context Intelligence & Memory Orchestration Layer** for AI agents. It:

1. **Ingests** conversations between users and AI agents
2. **Analyzes** them to extract structured knowledge
3. **Stores** this knowledge efficiently
4. **Retrieves** relevant context for future conversations

**Goal: 90% token savings while improving AI response quality.**

---

## The Problem This Solves

| Problem | How Memron Solves It |
|---------|---------------------|
| Raw conversation history is too long | Compress to structured memory units |
| AI makes same mistakes repeatedly | Track failure patterns, avoid them |
| Best answers emerge after multiple retries | Capture "winning paths" as recipes |
| Cross-agent knowledge transfer is poor | Store transferable success patterns |
| Hallucinations go undetected | Validate and score all retrieved context |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER / AI AGENT                                │
│                                     │                                       │
│                                     ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         MCP TOOLS LAYER                              │   │
│  │  memory_ingest │ recipe_search │ context_packet │ graph_query │ ... │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                     │                                       │
│                                     ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                       ANALYSIS ENGINE                                │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │   │
│  │  │   Episode    │  │   Memory     │  │  Trajectory  │               │   │
│  │  │   Splitter   │─▶│  Extractor   │─▶│   Analyzer   │               │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘               │   │
│  │         │                 │                 │                        │   │
│  │         ▼                 ▼                 ▼                        │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐               │   │
│  │  │   Entity     │  │   Recipe     │  │  Conflict    │               │   │
│  │  │  Extractor   │  │  Distiller   │  │  Detector    │               │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                     │                                       │
│                                     ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        DATABASE (PostgreSQL + pgvector)              │   │
│  │  episodes │ atomic_memories │ success_recipes │ entities │ ...      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Blocks - All Complete ✅

| Block | Name | Status | Files |
|-------|------|--------|-------|
| 1 | Episode Decomposition | ✅ | `episode-splitter.ts` |
| 2 | Atomic Memory Extraction | ✅ | `extractors/atomic-extractor.ts` |
| 3 | Trajectory Analysis | ✅ | `analyzers/trajectory-analyzer.ts`, `outcome-detector.ts`, `hallucination-detector.ts` |
| 4 | Recipe Distillation | ✅ | `distillers/recipe-distiller.ts`, `compression-optimizer.ts` |
| 5 | Prompt Versioning | ✅ | `versioning/prompt-tracker.ts`, `run-recorder.ts` |
| 6 | Knowledge Graph | ✅ | `extractors/entity-extractor.ts`, `lib/graph-builder.ts` |
| 7 | Memory Evolution | ✅ | `evolution/conflict-detector.ts`, `memory-updater.ts` |
| 8 | Anti-Hallucination Retrieval | ✅ | `retrieval/anti-hallucination.ts`, `packet-builder.ts` |
| 9 | MCP Tools | ✅ | `tools/ingest.ts`, `recipe.ts`, `packet.ts`, `graph.ts`, `versioning.ts`, `preference.ts` |

---

## Workflows

### Workflow 1: Ingesting a Conversation

When an AI agent completes a session:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Raw Messages   │────▶│  Episode Split  │────▶│ Memory Extract  │
│  (5000 tokens)  │     │  (3 episodes)   │     │  (15 memories)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
        ┌───────────────────────────────────────────────┘
        ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Trajectory      │────▶│ Recipe Distill  │────▶│ Entity Extract  │
│ Analysis        │     │ (if successful) │     │ (build graph)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                       │
        └───────────────────────┴───────────────────────┘
                                │
                                ▼
                    ┌─────────────────────┐
                    │   Store to Database │
                    │   (with embeddings) │
                    └─────────────────────┘
```

**Steps:**

1. **Episode Splitting** - Break conversation into semantic episodes:
   - Goal definition ("I need to build auth")
   - Troubleshooting ("It's not working because...")
   - Resolution ("That fixed it!")

2. **Memory Extraction** - From each episode, extract:
   - Facts: "API uses JWT tokens"
   - Preferences: "User prefers TypeScript"
   - Constraints: "Must be under 100 lines"
   - Goals: "Build a login system"

3. **Trajectory Analysis** - Understand what happened:
   - Did it succeed or fail?
   - Where were the pivot points?
   - Which approach won?

4. **Recipe Distillation** - If successful, create a reusable recipe:
   - Problem: "Implement JWT auth"
   - Steps: [Install, Configure, Test]
   - Do: "Use httpOnly cookies"
   - Don't: "Store tokens in localStorage"

5. **Entity Extraction** - Build knowledge graph:
   - Entities: React, TypeScript, JWT, passport.js
   - Relationships: "React uses hooks", "JWT requires secret"

6. **Store Everything** - Save with vector embeddings for retrieval

---

### Workflow 2: Building Context for New Conversation

When an agent needs context for a new task:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  User Query     │────▶│ Generate        │────▶│ Search          │
│  "Fix auth bug" │     │ Query Embedding │     │ Vector DB       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
        ┌───────────────────────────────────────────────┘
        ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Retrieve:       │────▶│ Anti-Halluc.    │────▶│ Build Memory    │
│ - Memories      │     │ Verification    │     │ Packet          │
│ - Recipes       │     └─────────────────┘     └─────────────────┘
│ - Entities      │                                     │
└─────────────────┘                                     ▼
                                            ┌─────────────────────┐
                                            │ Return to Agent     │
                                            │ (300 tokens vs 5000)│
                                            └─────────────────────┘
```

**The Memory Packet contains:**

```typescript
{
  // User context
  userPreferences: ["TypeScript", "strict mode", "JSDoc comments"],

  // Proven solution
  priorSuccessfulRecipe: {
    name: "JWT Auth Implementation",
    successRate: 0.85,
    doList: ["Use refresh tokens", "Validate on server"],
    dontList: ["Store in localStorage", "Skip expiry check"]
  },

  // Avoid past failures
  knownFailuresToAvoid: ["Don't use deprecated passport strategy"],

  // Recent facts
  latestFactualUpdates: ["API version is 2.0", "Using Express 5"],

  // Warnings
  warnings: ["Some information may need verification"],
  hallucinationRisk: "low"
}
```

---

### Workflow 3: Tracking Prompt Performance

Every execution is tracked to improve over time:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Prompt v3       │────▶│ Execute with    │────▶│ Record Outcome  │
│ + Context v2    │     │ Groq LLM        │     │ success: 0.85   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                                            ┌─────────────────────┐
                                            │ Compare Versions    │
                                            │ v2: 70% success     │
                                            │ v3: 85% success     │
                                            │ → Keep v3           │
                                            └─────────────────────┘
```

---

## Key Components

### 1. Episode Splitter
Breaks conversations at natural boundaries:
- User corrections ("No, that's wrong")
- Topic changes
- Success/failure signals ("Perfect!" or "That's broken")

### 2. Atomic Memory Units
Structured knowledge with metadata:
```typescript
{
  memoryId: "mem_abc123",
  memoryType: "preference",        // fact, goal, constraint, etc.
  content: "User prefers arrow functions",
  confidence: 0.9,                 // How certain
  successScore: 0.8,               // Did it lead to success?
  transferability: 0.7,            // Useful for other tasks?
}
```

### 3. Success Recipes
Compressed winning strategies:
```typescript
{
  recipeName: "Debug React Rendering",
  taskType: "debugging",
  problemStatement: "Component not re-rendering on state change",
  approach: [
    { step: 1, action: "Check if state is mutated directly" },
    { step: 2, action: "Verify useEffect dependencies" },
    { step: 3, action: "Use React DevTools to trace updates" }
  ],
  successRate: 0.82,
  doList: ["Use spread operator for state updates"],
  dontList: ["Mutate state directly"]
}
```

### 4. Knowledge Graph
Connects entities with relationships:
```
[React] ──uses──▶ [useState hook]
   │                    │
   └──has──▶ [Components] ◀──renders── [JSX]
```

### 5. Anti-Hallucination System
Before returning context, validates:
- Are memories still valid (not expired)?
- Any contradictions?
- Source verified?
- Risk level assessment

---

## File Structure

### Analysis Engine Package
```
packages/analysis-engine/
├── src/
│   ├── index.ts                           # Main exports
│   ├── types.ts                           # Core type definitions
│   ├── pipeline.ts                        # Analysis orchestration
│   ├── episode-splitter.ts                # Semantic episode decomposition
│   ├── analyzers/
│   │   ├── trajectory-analyzer.ts         # Success/failure trajectory
│   │   ├── outcome-detector.ts            # Outcome classification
│   │   ├── hallucination-detector.ts      # Hallucination detection
│   │   └── index.ts
│   ├── extractors/
│   │   ├── atomic-extractor.ts            # Memory unit extraction
│   │   ├── entity-extractor.ts            # Entity extraction
│   │   ├── preference-extractor.ts        # User preference detection
│   │   └── index.ts
│   ├── distillers/
│   │   ├── recipe-distiller.ts            # Success recipe extraction
│   │   ├── compression-optimizer.ts       # Content compression
│   │   └── index.ts
│   ├── evolution/
│   │   ├── conflict-detector.ts           # Memory conflict detection
│   │   ├── memory-updater.ts              # Memory updates/merges
│   │   └── index.ts
│   ├── embeddings/
│   │   ├── embedding-generator.ts         # Vector embeddings
│   │   └── index.ts
│   ├── llm/
│   │   ├── groq-client.ts                 # Groq SDK integration
│   │   ├── prompts.ts                     # Analysis prompts
│   │   └── index.ts
│   └── __tests__/                         # 6 test suites
├── samples/                               # 3 sample conversations
├── vitest.config.ts
└── package.json
```

### MCP Server Additions
```
services/mcp-server/src/
├── db/
│   ├── queries-analysis.ts                # CRUD operations
│   ├── schema.ts                          # 11 tables
│   ├── migrations/
│   │   └── 002_analysis_tables.sql        # Migration
│   └── migrate-analysis.ts                # Migration runner
├── tools/
│   ├── ingest.ts                          # memory_ingest, memory_analyze
│   ├── recipe.ts                          # recipe_* tools
│   ├── packet.ts                          # context_packet_* tools
│   ├── graph.ts                           # graph_* tools
│   ├── versioning.ts                      # prompt_*, run_* tools
│   ├── preference.ts                      # preference_* tools
│   └── index.ts                           # Registration
├── retrieval/
│   ├── anti-hallucination.ts              # Verification
│   └── packet-builder.ts                  # Memory packets
├── versioning/
│   ├── prompt-tracker.ts                  # Prompt versions
│   └── run-recorder.ts                    # Execution tracking
└── lib/
    └── graph-builder.ts                   # Knowledge graph
```

---

## MCP Tools Reference (30+ tools)

### Ingestion
```bash
memory_ingest { messages: [...], userId: 1 }      # Full ingestion
memory_analyze { messages: [...], quick: true }   # Analysis only
```

### Recipes
```bash
recipe_search { taskType: "auth", minSuccessRate: 0.7 }
recipe_create { recipeName: "...", approach: [...] }
recipe_feedback { recipeId: "...", feedback: "positive" }
recipe_get { recipeId: "..." }
```

### Preferences
```bash
preference_extract { messages: [...], store: true }
preference_get { category: "code_style" }
```

### Context Packets
```bash
context_packet { query: "Fix auth bug", tokenBudget: 500 }
context_packet_format { query: "..." }
context_packet_get { packetId: "..." }
```

### Knowledge Graph
```bash
graph_query { entityName: "React", depth: 2 }
graph_paths { fromEntity: "React", toEntity: "TypeScript" }
graph_hubs { limit: 10 }
graph_by_type { entityType: "technology" }
graph_stats {}
graph_add_entity { name: "Vue", type: "technology" }
graph_add_relationship { source: "Vue", target: "JavaScript", type: "uses" }
```

### Versioning
```bash
prompt_template_create { name: "...", description: "..." }
prompt_version_create { templateId: "...", rawText: "..." }
prompt_version_activate { templateId: "...", versionId: "..." }
prompt_version_history { templateId: "..." }
prompt_version_compare { versionIdA: "...", versionIdB: "..." }
prompt_version_get { templateId: "..." }
run_record { sessionId: "...", inputTokens: 500, successScore: 0.9 }
run_feedback { runId: "...", feedback: "positive" }
run_session_analytics { sessionId: "..." }
run_prompt_stats { limit: 10 }
run_hallucinations { limit: 20 }
run_get { runId: "..." }
```

---

## Database Schema

```
┌─────────────────────────────────────────────────────────────────┐
│                         11 Tables                               │
├─────────────────────────────────────────────────────────────────┤
│ episodes          │ Conversation segments                       │
│ atomic_memories   │ Structured knowledge + embeddings           │
│ success_recipes   │ Distilled winning strategies                │
│ failure_patterns  │ What to avoid                               │
│ entities          │ Knowledge graph nodes                       │
│ entity_relations  │ Knowledge graph edges                       │
│ prompt_templates  │ Prompt definitions                          │
│ prompt_versions   │ Version tracking                            │
│ prompt_diffs      │ Semantic changes                            │
│ run_records       │ Execution tracking                          │
│ memory_packets    │ Cached context packets                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Token Economics

| Without Memron | With Memron | Savings |
|----------------|-------------|---------|
| 5000 tokens (raw history) | 3 tokens (memory pointer) | 99.9% |
| 2000 tokens (context) | 300 tokens (memory packet) | 85% |
| Multiple retries needed | First-attempt success recipes | Fewer calls |

---

## Getting Started

```bash
# 1. Install dependencies
pnpm install

# 2. Set environment variables
export DATABASE_URL="postgresql://..."
export GROQ_API_KEY="..."

# 3. Run database migration
pnpm --filter @memron/mcp-server db:migrate:analysis

# 4. Start the MCP server
pnpm --filter @memron/mcp-server dev

# 5. Run tests
pnpm --filter @memron/analysis-engine test
```

---

## Future Enhancements

1. **OpenAI/Cohere Embeddings** - Replace local embeddings with production-grade
2. **Real-time Streaming** - Stream analysis results as they're computed
3. **Multi-tenant Support** - Workspace and team-based memory sharing
4. **Dashboard UI** - Visual exploration of memories and recipes
5. **A/B Testing** - Automated prompt version experiments
