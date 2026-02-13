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
│    │ Pointer   │  │    Lit      │  │    IPFS     │                │
│    │ Engine    │  │ Encryption  │  │ Persistence │                │
│    │ (89-95%   │  │ (Threshold  │  │ (CID        │                │
│    │  compress)│  │  Decrypt)   │  │  Anchoring) │                │
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
│    │  Trust Registry         │ ◄── On-chain (Solidity)             │
│    │  (Collaborative Scores) │                                     │
│    └─────────────────────────┘                                     │
│                                                                     │
│  ┌─────────┐  ┌──────────┐  ┌─────────────┐  ┌──────────────────┐ │
│  │  Redis  │  │ Postgres │  │  IPFS Node  │  │  Lit Protocol    │ │
│  │ (Cache) │  │ (Index)  │  │  (Storage)  │  │  Network         │ │
│  └─────────┘  └──────────┘  └─────────────┘  └──────────────────┘ │
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
  ├─3─► LitEncryptionService.encrypt() → Threshold-encrypted blob
  │     └── AccessControlConditions = [owner DID]
  │
  ├─4─► IPFSPersistenceService.store() → Returns CID
  │     └── Content is immutable, addressable by hash
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
