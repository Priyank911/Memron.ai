# Memron AI Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        MEMRON AI PLATFORM                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────────────┐  │
│  │  Landing     │  │  Platform UI │  │  CLI                      │  │
│  │  (Next.js)   │  │  (React+Vite)│  │  (Commander)              │  │
│  └──────┬───────┘  └──────┬───────┘  └────────────┬──────────────┘  │
│         │                 │                        │                 │
│  ═══════╪═════════════════╪════════════════════════╪══════════════   │
│         │           ┌─────┴──────┐                 │                 │
│         │           │  Gateway   │◄────────────────┘                 │
│         │           │  (WS Hub)  │                                   │
│         │           └─────┬──────┘                                   │
│         │                 │                                          │
│  ═══════╪═════════════════╪═══════════════════════════════════════   │
│         │          ┌──────┴──────────────┐                          │
│         │          │  Memory Tunnel API  │   ◄── MCP Endpoint       │
│         │          │  (Hono + MCP Bridge)│                          │
│         │          └──────┬──────────────┘                          │
│         │                 │                                          │
│  ═══════╪═════════════════╪═══════════════════════════════════════   │
│         │    ┌────────────┼────────────────┐                        │
│         │    │            │                │                        │
│    ┌────┴───┴──┐  ┌──────┴──────┐  ┌──────┴──────┐                │
│    │ Pointer   │  │ Encryption  │  │ Persistence│                │
│    │ Engine    │  │ Service     │  │ Service    │                │
│    │ (89-95%   │  │ (AES-256   │  │ (Storage   │                │
│    │  compress)│  │  -GCM)     │  │  Backend)  │                │
│    └───────────┘  └─────────────┘  └─────────────┘                │
│         │                 │                │                        │
│    ┌────┴─────────────────┴────────────────┴───┐                   │
│    │          Memory Core Orchestrator          │                   │
│    │  ┌──────────┐ ┌──────────┐ ┌────────────┐ │                   │
│    │  │ Forensic │ │ Access   │ │ Context    │ │                   │
│    │  │ Engine   │ │ Manager  │ │ Rot Guard  │ │                   │
│    │  └──────────┘ └──────────┘ └────────────┘ │                   │
│    └───────────────────────────────────────────┘                   │
│         │                                                           │
│    ┌────┴────────────────────┐                                     │
│    │  Trust Registry         │                                     │
│    │  (Collaborative Scores) │                                     │
│    └─────────────────────────┘                                     │
│                                                                     │
│  ┌─────────┐  ┌──────────┐                                       │
│  │  Redis  │  │ Postgres │                                       │
│  │ (Cache) │  │ (Index)  │                                       │
│  └─────────┘  └──────────┘                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Flow: Memory Ingestion

```
Raw Content (Agent Output)
  │
  ├─1─► BucketRouter.classify() → Assigns thematic bucket
  │
  ├─2─► ForensicEngine.createSnapshot() → Pre-mutation snapshot
  │
  ├─3─► EncryptionService.encrypt() → AES-256-GCM encrypted blob
  │     └── AccessConditions = [owner DID]
  │
  ├─4─► PersistenceService.store() → Returns storage ID
  │     └── Content is immutable, addressable by ID
  │
  ├─5─► PointerEngine.createPointer() → Returns ptr_xxxxxxxx
  │     └── Compression: ~1000 tokens → ~3 tokens (99.7%)
  │
  └─6─► Return Pointer to Agent
        └── Agent uses pointer in subsequent conversations
```

## Data Flow: Context Injection (Anti-"Needle in Haystack")

```
Agent Query: "What did we discuss about auth?"
  │
  ├─1─► Semantic search across memory buckets
  │
  ├─2─► ContextRotGuard filters stale results
  │
  ├─3─► ContextInjector ranks by relevance
  │
  ├─4─► Top N slices fit within token budget
  │
  └─5─► Inject exact context slices into inference window
        └── No full history replay — surgical precision
```
