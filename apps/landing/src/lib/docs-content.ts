export interface DocItem {
  id: string;
  slug: string;
  title: string;
  category: string;
  badge?: string;
  badgeType?: 'default' | 'mcp' | 'post' | 'get' | 'new';
  description: string;
  readTime: string;
  updated?: string;
  content: {
    lead: string;
    sections: {
      id: string;
      heading: string;
      body?: string;
      alert?: {
        type: 'note' | 'tip' | 'important' | 'warning';
        title: string;
        message: string;
      };
      codeExample?: {
        language: string;
        tabs: {
          label: string;
          lang: string;
          code: string;
        }[];
      };
      table?: {
        headers: string[];
        rows: string[][];
      };
    }[];
  };
}

export interface DocCategory {
  id: string;
  title: string;
  icon: string;
  items: {
    id: string;
    slug: string;
    title: string;
    badge?: string;
    badgeType?: 'default' | 'mcp' | 'post' | 'get' | 'new';
  }[];
}

export const DOCS_VERSION = 'v2.4 Sovereign';
export const ENGINE_CONTRACT = 'v2';
export const ACTIVE_TOOL_COUNT = 8;

export const DOC_CATEGORIES: DocCategory[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: 'Rocket',
    items: [
      { id: 'introduction', slug: 'introduction', title: 'What is Memron?', badge: 'Start' },
      { id: 'quickstart', slug: 'quickstart', title: '3-Minute Quickstart', badge: 'v2.4' },
      { id: 'architecture-overview', slug: 'architecture-overview', title: '7-Layer Memory Model' },
    ],
  },
  {
    id: 'core-engine',
    title: 'Core Engine & Retrieval',
    icon: 'Layers',
    items: [
      { id: 'dual-database', slug: 'dual-database', title: 'Dual-Database Architecture' },
      { id: 'hybrid-retrieval', slug: 'hybrid-retrieval', title: 'Hybrid Retrieval (RRF)' },
      { id: 'openai-engine', slug: 'openai-engine', title: 'OpenAI Engine & Models', badge: 'Updated' },
      { id: 'encryption-security', slug: 'encryption-security', title: 'AES-256 & Blind Index' },
    ],
  },
  {
    id: 'mcp-tools',
    title: 'MCP Tools (8 active)',
    icon: 'Terminal',
    items: [
      { id: 'mcp-overview', slug: 'mcp-overview', title: 'MCP Protocol Overview', badge: 'MCP' },
      { id: 'memory-tools', slug: 'memory-tools', title: '4 Core Memory Verbs', badge: '4 Verbs' },
      { id: 'pinned-facts', slug: 'pinned-facts', title: 'Pinned Facts & Constraints', badge: 'New' },
      { id: 'knowledge-graph', slug: 'knowledge-graph', title: 'Knowledge Graph & Paths', badge: 'Graph' },
      { id: 'context-packets', slug: 'context-packets', title: 'Context Packets & XML', badge: 'Anti-Drift' },
      { id: 'recipes-playbooks', slug: 'recipes-playbooks', title: 'Recipes & Distillation', badge: 'Playbooks' },
      { id: 'preferences-ingest', slug: 'preferences-ingest', title: 'Ingestion & Preferences', badge: 'Pipeline' },
      { id: 'prompt-versioning-runs', slug: 'prompt-versioning-runs', title: 'Prompt Versioning & Runs', badge: 'Observability' },
    ],
  },
  {
    id: 'integrations',
    title: 'Agent Integrations',
    icon: 'Cpu',
    items: [
      { id: 'cursor-setup', slug: 'cursor-setup', title: 'Cursor IDE Integration' },
      { id: 'vscode-mcp', slug: 'vscode-mcp', title: 'VS Code & Roo/Cline' },
      { id: 'claude-desktop', slug: 'claude-desktop', title: 'Claude Code & Desktop' },
      { id: 'typescript-python-sdk', slug: 'typescript-python-sdk', title: 'TypeScript & Python SDK' },
    ],
  },
  {
    id: 'api-reference',
    title: 'REST API & Identity',
    icon: 'Webhook',
    items: [
      { id: 'auth-identity', slug: 'auth-identity', title: 'WorkOS AuthKit & Keys', badge: 'Auth' },
      { id: 'rest-endpoints', slug: 'rest-endpoints', title: 'Dashboard REST APIs', badge: 'REST' },
    ],
  },
];

export const DOC_ITEMS: Record<string, DocItem> = {
  'introduction': {
    id: 'introduction',
    slug: 'introduction',
    title: 'What is Memron?',
    category: 'Getting Started',
    badge: 'Overview',
    description: 'Context intelligence and memory orchestration for AI agents.',
    readTime: '3 min read',
    updated: 'Oct 2026 · engine v2',
    content: {
      lead: 'Memron is the memory backbone for autonomous agents. Raw conversation turns go in — encrypted, indexed memory pointers come out. Agents recall with **3-token pointers** like `ptr_7xK9q2` instead of replaying 40,000 raw tokens.',
      sections: [
        {
          id: 'the-three-problems',
          heading: 'The 3 problems Memron solves',
          body: 'Every frontier agent — **Claude**, **Cursor**, **Codex**, **Copilot** — hits the same three walls:\n\n1. **Context amnesia** — every session starts blank. What failed, which edge cases were found, and which constraints your team set are all gone.\n2. **Token waste** — replaying `15,000–40,000` raw tokens of history to recover context burns budget on rediscovery.\n3. **Hallucination drift** — without grounded facts, agents invent library versions, fake endpoints, and contradict verified approaches.',
          alert: {
            type: 'important',
            title: 'The two guarantees',
            message: 'Memron guarantees (1) ~90% token reduction via pointer compression and (2) measurably less factual drift via pinned constraints + hybrid recall. Pointers are 3 tokens; the paragraphs they stand for are not.',
          },
        },
        {
          id: 'the-solution',
          heading: 'How Memron solves memory',
          body: 'Memron runs a **7-layer memory hierarchy** with an analysis pipeline and **4 consolidated MCP verbs**. Content is encrypted with `AES-256-GCM`, embedded with `text-embedding-3-small`, and triaged through a human-controlled **Inbox** before it becomes durable knowledge.\n\nThe engine contract is **v2**: `memory_store` needs only `content`, `memory_recall` needs only `query`. Classification, namespace, signals, and token budget are inferred server-side.',
          table: {
            headers: ['Pillar', 'What it does', 'Outcome'],
            rows: [
              ['7-layer model', 'Working, episodic, semantic, procedural, evaluative, social, archive tiers.', 'Deterministic recall across sessions'],
              ['Analysis pipeline', 'Extracts atomic facts, entities, workflows; checks contradictions.', '~90% compression via pointers'],
              ['4 core verbs', '`memory_store`, `memory_recall`, `memory_manage`, `memory_validate`.', 'One predictable agent interface'],
              ['8 active tools', '4 verbs + `profile_get/update` + `system_diagnostics` / `memory_debug`.', 'Small surface, low confusion'],
            ],
          },
        },
        {
          id: 'where-to-go-next',
          heading: 'Where to go next',
          body: 'New here? Follow this path:\n\n1. **3-Minute Quickstart** — mint a key (`mm_live_…`) and connect one agent.\n2. **7-Layer Memory Model** — learn what goes where and why.\n3. **4 Core Memory Verbs** — the only write/read surface your agent needs.',
        },
      ],
    },
  },

  'quickstart': {
    id: 'quickstart',
    slug: 'quickstart',
    title: '3-Minute Quickstart',
    category: 'Getting Started',
    badge: 'Quickstart',
    description: 'Mint a key, connect one agent over MCP, store and recall.',
    readTime: '3 min read',
    updated: 'Oct 2026 · engine v2',
    content: {
      lead: 'Connect any MCP-capable agent to Memron over **HTTP** at `POST /mcp`. Three auth modes exist — **direct API key** (`Bearer mm_live_…`) is the simplest and works everywhere.',
      sections: [
        {
          id: 'step-1-get-api-key',
          heading: '1. Mint a sovereign API key',
          body: 'Sign in to the **Memron Dashboard → API Keys → Create key**. Copy the `mm_live_…` value — it is shown **once**. The server stores only its `SHA-256` hash and caches auth decisions for **5 minutes**.\n\nKeep one key per agent runtime so you can revoke individually. Revocation is a dashboard action and takes effect on cache expiry at the latest.',
          alert: {
            type: 'tip',
            title: 'Zero-trust default',
            message: 'Keys are bearer credentials. Put yours in an env var (MEMRON_API_KEY), never in git. If a key leaks, revoke it and mint a new one.',
          },
        },
        {
          id: 'step-2-connect-mcp',
          heading: '2. Point your agent at /mcp',
          body: 'Use **direct HTTP** where your client supports headers, or `mcp-remote` over stdio where it only speaks local processes. The endpoint and auth header never change: `http://localhost:4201/mcp` + `Authorization: Bearer mm_live_…`.',
          codeExample: {
            language: 'json',
            tabs: [
              {
                label: 'Cursor (.cursor/mcp.json)',
                lang: 'json',
                code: `{\n  "mcpServers": {\n    "memron": {\n      "url": "http://localhost:4201/mcp",\n      "headers": { "Authorization": "Bearer mm_live_YOUR_API_KEY" }\n    }\n  }\n}`,
              },
              {
                label: 'Claude Desktop (mcp-remote)',
                lang: 'json',
                code: `{\n  "mcpServers": {\n    "memron": {\n      "command": "npx",\n      "args": [\n        "-y", "mcp-remote",\n        "http://localhost:4201/mcp",\n        "--header", "Authorization: Bearer mm_live_YOUR_API_KEY"\n      ]\n    }\n  }\n}`,
              },
              {
                label: 'Verify (curl)',
                lang: 'bash',
                code: `curl -X POST http://localhost:4201/mcp \\\n  -H "Authorization: Bearer mm_live_YOUR_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -H "Accept: application/json, text/event-stream" \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`,
              },
            ],
          },
        },
        {
          id: 'step-3-test-tools',
          heading: '3. Store once, recall forever',
          body: 'Ask your agent: **“Remember that our backend uses Postgres pgvector with 1536-dim embeddings and snake_case tables.”**\n\nThe agent calls `memory_store` with just `content`. The server encrypts, embeds, classifies the bucket, and returns a pointer like `ptr_7xK9q2`. New items land in the **Inbox (`untriaged`)** for human triage.\n\nLater, **“What DB conventions did we agree on?”** triggers `memory_recall` with just `query` — hybrid retrieval does the rest within an inferred token budget.',
          codeExample: {
            language: 'json',
            tabs: [
              {
                label: 'memory_store',
                lang: 'json',
                code: `{\n  "jsonrpc": "2.0", "id": 101, "method": "tools/call",\n  "params": {\n    "name": "memory_store",\n    "arguments": {\n      "content": "Backend uses Postgres pgvector, 1536-dim embeddings, snake_case tables.",\n      "tags": ["database", "postgres", "standards"]\n    }\n  }\n}`,
              },
              {
                label: 'memory_recall',
                lang: 'json',
                code: `{\n  "jsonrpc": "2.0", "id": 102, "method": "tools/call",\n  "params": {\n    "name": "memory_recall",\n    "arguments": { "query": "What DB conventions did we agree on?" }\n  }\n}`,
              },
            ],
          },
          alert: {
            type: 'note',
            title: 'Minimal v2 schema',
            message: 'content (store) and query (recall) are the only required fields. tags, importance, space, and budget are optional overrides — omit them until you need them.',
          },
        },
      ],
    },
  },

  'architecture-overview': {
    id: 'architecture-overview',
    slug: 'architecture-overview',
    title: '7-Layer Memory Model',
    category: 'Getting Started',
    description: 'The seven cognitive tiers behind every pointer.',
    readTime: '5 min read',
    updated: 'Oct 2026 · engine v2',
    content: {
      lead: 'Like biological cognition, agents need fast working context **and** slow durable knowledge. Memron splits memory into **seven tiers** so recall can be surgical instead of dumping everything into the prompt.',
      sections: [
        {
          id: 'the-7-layers',
          heading: 'The 7 tiers',
          body: 'Every `memory_store` is classified into a tier. The tier decides **lifecycle** (ephemeral vs. exempt from decay), **bucket**, and **retrieval weight**.',
          table: {
            headers: ['Layer', 'Name', 'Lifecycle', 'Typical content'],
            rows: [
              ['L1', 'Working', 'Ephemeral session cache', 'Active prompt state, open files, scratchpad'],
              ['L2', 'Episodic', '`episodes` table', 'Past turns, intents, task attempts'],
              ['L3', 'Semantic', '`pgvector` + graph nodes', 'Atomic facts, invariants, standards'],
              ['L4', 'Procedural', '`success_recipes`', 'How-to playbooks, build and debug steps'],
              ['L5', 'Evaluative', 'Run traces + drift flags', 'Failures, anti-patterns, contradictions'],
              ['L6', 'Social', 'Trust registry + shared buckets', 'Team guidelines, cross-agent context'],
              ['L7', 'Archive', 'Encrypted forensic snapshots', 'Immutable audit trail'],
            ],
          },
        },
        {
          id: 'memory-pointers',
          heading: 'Pointers, not pastes',
          body: 'Instead of injecting full histories, Memron hands the model a pointer such as `ptr_82a1f` (about **3 tokens**). The agent dereferences it with `memory_recall` only when the underlying detail matters.\n\nA `500-token` paragraph becomes one pointer. Over a `20-turn` trajectory that is the difference between drowning and working.',
          alert: {
            type: 'tip',
            title: 'Inbox by default',
            message: 'Fresh stores land as untriaged in the dashboard Inbox. Promote to context or knowledge during triage — knowledge items are decay-exempt and ranked higher in recall.',
          },
        },
      ],
    },
  },

  'dual-database': {
    id: 'dual-database',
    slug: 'dual-database',
    title: 'Dual-Database Architecture',
    category: 'Core Engine & Retrieval',
    description: 'Web primary + sovereign vector node with self-healing sync.',
    readTime: '4 min read',
    updated: 'Oct 2026 · engine v2',
    content: {
      lead: 'Memron isolates **web throughput** from **vector search**. A primary Postgres handles auth, dashboard, and billing state; a Supabase Postgres + `pgvector` node serves MCP auth and similarity search.',
      sections: [
        {
          id: 'database-responsibilities',
          heading: 'Who owns what',
          body: '1. **Primary Web DB (Aiven Postgres)** — WorkOS sessions, dashboard analytics, accounts, bucket policies, key registry.\n2. **Sovereign Node (Supabase Postgres + pgvector)** — `1536-dim` embeddings, blind-indexed graph nodes and edges, and the API-key verification cache (`SELECT * FROM api_keys WHERE key_hash = $1`).\n3. **Cloud backup** — cross-region snapshots for disaster recovery.',
        },
        {
          id: 'self-healing-sync',
          heading: 'Self-healing sync',
          body: 'When a key is minted or revoked in the Next.js frontend, `supabase-sync.ts` mirrors the **hash** (never the secret) to Supabase. If the user has no row there yet, the engine **provisions identity + default workspace** on the fly and sets `is_active = true`.\n\nMCP auth then hits the in-memory cache first (**5-min TTL**) and the sovereign node on miss — p95 in the low single-digit milliseconds.',
          codeExample: {
            language: 'typescript',
            tabs: [
              {
                label: 'supabase-sync.ts',
                lang: 'typescript',
                code: `// apps/landing/src/lib/supabase-sync.ts\nconst supabaseUser = await resolveOrProvisionSupabaseUser({\n  authUserId: user.id, email: user.email, name: user.name,\n});\n\nawait syncApiKeyToSupabase({\n  keyId: newKey.id,\n  keyHash: newKey.key_hash, // SHA-256 only, never the secret\n  keyPrefix: newKey.key_prefix,\n  name: newKey.name,\n  userId: supabaseUser.id,\n});`,
              },
            ],
          },
        },
      ],
    },
  },

  'hybrid-retrieval': {
    id: 'hybrid-retrieval',
    slug: 'hybrid-retrieval',
    title: 'Hybrid Retrieval (RRF)',
    category: 'Core Engine & Retrieval',
    description: 'Vector + BM25 + graph + decay fused with Reciprocal Rank Fusion.',
    readTime: '4 min read',
    updated: 'Oct 2026 · engine v2',
    content: {
      lead: 'Pure vector search misses exact symbols, recency, and multi-hop relations. Memron runs **four signals concurrently** and fuses ranks with **RRF (`k = 60`)** — ranks, not raw scores, so incompatible distributions cannot dominate.',
      sections: [
        {
          id: 'the-4-signals',
          heading: 'The 4 signals',
          body: '1. **Vector cosine (w 1.0)** — HNSW over `1536-dim` `text-embedding-3-small` vectors.\n2. **BM25 full-text (w 0.8)** — `tsvector` + `ts_rank_cd` for symbols, acronyms, exact phrases.\n3. **Graph traversal (w 1.2)** — blind-hash anchor lookup + recursive CTE `N-hop` expansion.\n4. **Ebbinghaus decay (w 0.6)** — exponential forgetting with a `7-day` half-life and frequency reinforcement.\n\nYou never pick signals manually — `memory_recall` fuses all four. Use `budget` to cap tokens, `space` to scope a namespace.',
          alert: {
            type: 'tip',
            title: 'RRF formula',
            message: 'score(d) = Σ w_i / (k + rank_i(d)), k = 60. A memory ranked #1 by graph and #40 by vector still surfaces — that is the point.',
          },
        },
        {
          id: 'when-recall-misses',
          heading: 'When recall misses, check the pipeline',
          body: 'Misses are almost never ranking bugs. Run `system_diagnostics` (queue depths, embedding circuit state) then `memory_debug` with the `pointerId` (row present? embedding dims? index job dead-lettered?). The verdict tells you whether to wait, re-embed, or restore a soft-deleted row.',
        },
      ],
    },
  },

  'openai-engine': {
    id: 'openai-engine',
    slug: 'openai-engine',
    title: 'OpenAI Engine & Models',
    category: 'Core Engine & Retrieval',
    badge: 'Updated',
    description: 'gpt-4o-mini + text-embedding-3-small across analysis and recall.',
    readTime: '3 min read',
    updated: 'Oct 2026 · engine v2',
    content: {
      lead: 'Memron standardises on **OpenAI** small, fast, deterministic models: `gpt-4o-mini` for reasoning and extraction, `text-embedding-3-small` for vectors. Cheap enough to run per-store, good enough to trust.',
      sections: [
        {
          id: 'model-allocations',
          heading: 'Model allocation',
          table: {
            headers: ['Task', 'Model', 'Temp', 'Purpose'],
            rows: [
              ['Playground RAG + recall', '`gpt-4o-mini`', '`0.0` deterministic', 'Answers strictly grounded in retrieved context'],
              ['Fact extraction', '`gpt-4o-mini`', '`0.1` structured JSON', 'Atomic facts, entities, relations'],
              ['Embeddings', '`text-embedding-3-small`', '`1536` dims', 'HNSW vectors for pgvector'],
              ['Title generation', '`gpt-4o-mini`', '`0.3`', 'Short human titles for pointers'],
            ],
          },
        },
        {
          id: 'sync-then-queue',
          heading: 'Sync embed, queued graph',
          body: '`memory_store` embeds **synchronously** (one attempt on Workers, retries on Node) so vectors exist immediately. Graph extraction and re-embeds on failure run as **background index jobs** — `system_diagnostics` shows their depth and dead letters.',
        },
      ],
    },
  },

  'encryption-security': {
    id: 'encryption-security',
    slug: 'encryption-security',
    title: 'AES-256 & Blind Indexing',
    category: 'Core Engine & Retrieval',
    description: 'Zero-knowledge storage with traversable encrypted graphs.',
    readTime: '4 min read',
    updated: 'Oct 2026 · engine v2',
    content: {
      lead: 'The server stores and traverses your graph **without reading plaintext**. Payloads are `AES-256-GCM` ciphertext; entity lookup uses deterministic `HMAC-SHA256` blind hashes.',
      sections: [
        {
          id: 'aes-256-gcm',
          heading: 'Payload encryption (AES-256-GCM)',
          body: 'Every memory body, note, and graph property is encrypted with a unique **12-byte IV** and **16-byte auth tag**. Tampered rows fail authentication instead of decrypting to garbage. Decryption happens only at `memory_recall` time, scoped to your `userId`.',
        },
        {
          id: 'blind-indexing',
          heading: 'Blind indexing (HMAC-SHA256)',
          body: 'Entity names never hit the DB in cleartext. The engine stores `HMAC(blind_key, normalize(name) + ":" + user_id)` — deterministic per user, opaque to operators. Traversal, hub detection, and path-finding all run on hashes; only your recall response decrypts labels.',
        },
      ],
    },
  },

  'mcp-overview': {
    id: 'mcp-overview',
    slug: 'mcp-overview',
    title: 'MCP Protocol Overview',
    category: 'MCP Tools (8 active)',
    badge: 'Protocol',
    description: 'JSON-RPC 2.0 over HTTP, three transports, one auth header.',
    readTime: '3 min read',
    updated: 'Oct 2026 · engine v2',
    content: {
      lead: 'The **Model Context Protocol** connects models to tools over **JSON-RPC 2.0**. Memron serves it as a standalone microservice (`services/mcp-server`) mounted at `/mcp` — **8 active tools**, Zod-validated, auth-cached.',
      sections: [
        {
          id: 'server-architecture',
          heading: 'Architecture',
          body: '1. **Transport** — Streamable HTTP at `POST /mcp` (`Accept: application/json, text/event-stream`); `mcp-remote` bridges stdio-only clients; direct `stdio.js` for local processes.\n2. **Auth** — `Authorization: Bearer mm_live_…` → `SHA-256` → 5-min in-memory cache → sovereign DB on miss.\n3. **Validation** — Zod schemas reject malformed calls before any DB or decrypt work.\n4. **Accounting** — every store/recall records tokens saved and emits dashboard events.',
          table: {
            headers: ['Tool', 'Kind', 'Args'],
            rows: [
              ['`memory_store`', 'Write', '`content` + optional `tags, importance, space`'],
              ['`memory_recall`', 'Read', '`query` + optional `budget, space`'],
              ['`memory_manage`', 'Mutate', '`action, pointerId` + per-action fields'],
              ['`memory_validate`', 'Guardrail', '`action` + optional `proposedPlan, context`'],
              ['`profile_get` / `profile_update`', 'Identity', 'None / `firstName, lastName, displayName`'],
              ['`system_diagnostics` / `memory_debug`', 'Read-only ops', 'None / `pointerId`'],
            ],
          },
          alert: {
            type: 'note',
            title: '8 tools, not 40',
            message: 'Older guides list dozens of verbs (graph_*, recipe_*, context_*). Those modules exist in source but are not registered. The 4 core verbs plus profile and diagnostics are the entire live surface.',
          },
        },
      ],
    },
  },

  'memory-tools': {
    id: 'memory-tools',
    slug: 'memory-tools',
    title: 'Memory CRUD & History',
    category: 'MCP Tools (8 active)',
    badge: 'Core Tools',
    description: 'The 4 verbs: store, recall, manage, validate — with exact schemas.',
    readTime: '6 min read',
    updated: 'Oct 2026 · engine v2',
    content: {
      lead: 'Four verbs cover the whole lifecycle. **Store** writes, **recall** reads, **manage** mutates, **validate** pre-checks. Admin and analytics stay in the dashboard — agents get the minimal surface that cannot confuse them.',
      sections: [
        {
          id: 'tool-reference',
          heading: 'Verb reference',
          table: {
            headers: ['Verb', 'Required', 'Optional', 'Returns'],
            rows: [
              ['`memory_store`', '`content` (1–50k chars)', '`tags[20], importance 0–1, space`', '`pointerId`, bucket, tokens saved'],
              ['`memory_recall`', '`query` (1–2k chars)', '`budget` 1–10k, `space`', 'Ranked memories + token estimate'],
              ['`memory_manage`', '`action, pointerId`', 'Per action (see below)', '`success` + resulting state'],
              ['`memory_validate`', '`action`', '`proposedPlan, context`', '`safe`, score, violations'],
            ],
          },
        },
        {
          id: 'manage-actions',
          heading: '`memory_manage` actions',
          body: '1. **`update`** — needs `content` (+ optional `title, tags`). Creates a forensic snapshot first.\n2. **`delete` / `archive`** — soft-deletes; recall excludes inactive rows by design.\n3. **`pin` / `unpin`** — promotes a memory to always-injected constraints (or removes it).\n4. **`triage`** — sets `status`: `untriaged, context, knowledge, archived`. `knowledge` is decay-exempt.\n5. **`merge`** — needs `targetPointerId`; folds duplicates.\n6. **`feedback`** — takes `{ rating 1–5, success, comments }`.',
          alert: {
            type: 'tip',
            title: 'Inbox discipline',
            message: 'New stores default to untriaged. Triage in the dashboard or via memory_manage — untriaged items still recall, but triaged knowledge ranks higher and survives decay.',
          },
        },
        {
          id: 'code-example',
          heading: 'Wire example',
          body: 'Minimal JSON-RPC. Note how little the agent must supply — the server infers bucket, title, namespace, and budget.',
          codeExample: {
            language: 'json',
            tabs: [
              {
                label: 'Request',
                lang: 'json',
                code: `{\n  "jsonrpc": "2.0", "id": 101, "method": "tools/call",\n  "params": {\n    "name": "memory_store",\n    "arguments": {\n      "content": "All tables include id SERIAL PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT NOW().",\n      "tags": ["database", "postgres", "standards"]\n    }\n  }\n}`,
              },
              {
                label: 'Response',
                lang: 'json',
                code: `{\n  "jsonrpc": "2.0", "id": 101,\n  "result": {\n    "status": "stored",\n    "pointerId": "ptr_89aB12",\n    "bucket": "knowledge",\n    "tokensSaved": 48\n  }\n}`,
              },
            ],
          },
        },
      ],
    },
  },

  'pinned-facts': {
    id: 'pinned-facts',
    slug: 'pinned-facts',
    title: 'Pinned Facts (Always-Injected)',
    category: 'MCP Tools (8 active)',
    badge: 'Sovereign',
    description: 'Always-on constraints via pin/unpin inside memory_manage.',
    readTime: '4 min read',
    updated: 'Oct 2026 · engine v2',
    content: {
      lead: 'Pinned facts **skip ranking entirely** — they prepend to every recall response. Use them for invariants the agent must never violate: stack choices, naming rules, security constraints.',
      sections: [
        {
          id: 'pinned-tools',
          heading: 'How pinning works in v2',
          body: 'There is no standalone `memory_pin` tool in the live surface. Pinning is a `memory_manage` action:\n\n1. Store the rule with `memory_store` (keep it under `500` chars).\n2. Call `memory_manage` with `action: "pin"` and the returned `pointerId`.\n3. Every future `memory_recall` includes it as an active constraint; `memory_validate` checks plans against it.\n4. Remove with `action: "unpin"` — a soft-delete, fully reversible.',
          table: {
            headers: ['Step', 'Call', 'Effect'],
            rows: [
              ['Store', '`memory_store { content }`', 'Encrypted row, returns `pointerId`'],
              ['Pin', '`memory_manage { action: "pin", pointerId }`', 'Injected into every recall'],
              ['Enforce', '`memory_validate { action, proposedPlan }`', 'Flags violations pre-execution'],
              ['Unpin', '`memory_manage { action: "unpin", pointerId }`', 'Stops injection, keeps history'],
            ],
          },
          alert: {
            type: 'important',
            title: 'Token economy warning',
            message: 'Pinned facts ride along on EVERY turn. Keep each under 500 characters and pin only true invariants — style, security, stack. Everything else belongs in normal recall.',
          },
        },
      ],
    },
  },

  'knowledge-graph': {
    id: 'knowledge-graph',
    slug: 'knowledge-graph',
    title: 'Knowledge Graph & Paths',
    category: 'MCP Tools (8 active)',
    badge: 'Graph',
    description: 'Blind-hash entities + N-hop traversal, served through recall.',
    readTime: '5 min read',
    updated: 'Oct 2026 · engine v2',
    content: {
      lead: 'Memron links concepts, people, repos, and preferences with **bi-temporal edges** over `HMAC`-hashed entities. In v2 you reach the graph through `memory_recall` — the graph signal (weight `1.2`) fires automatically.',
      sections: [
        {
          id: 'graph-tools',
          heading: 'Graph concepts, v2 mapping',
          body: 'The legacy `graph_*` modules (query, paths, hubs, by-type, stats, add-entity, add-relationship) are **not separately registered**. Their behavior lives inside the engine:\n\n1. **Anchors** — entity mentions in `content` are blind-hashed at store time.\n2. **Expansion** — recall runs recursive CTE `N-hop` expansion from those anchors.\n3. **Hubs & paths** — highly connected nodes boost fused RRF scores; path context ships inside recall results.\n4. **Writes** — `memory_store` is the only write path; it queues graph indexing in the background.',
          table: {
            headers: ['Old tool', 'v2 equivalent', 'Notes'],
            rows: [
              ['`graph_query`', '`memory_recall { query }`', 'Graph signal auto-included, w 1.2'],
              ['`graph_paths`', 'Recall result context', 'Multi-hop paths inline in results'],
              ['`graph_hubs`', 'Fused ranking', 'Hubs surface via higher scores'],
              ['`graph_add_entity`', '`memory_store { content }`', 'Entities extracted at index time'],
            ],
          },
        },
      ],
    },
  },

  'context-packets': {
    id: 'context-packets',
    slug: 'context-packets',
    title: 'Context Packets & XML',
    category: 'MCP Tools (8 active)',
    badge: 'Context',
    description: 'Token-budgeted, anti-hallucination XML built by recall.',
    readTime: '4 min read',
    updated: 'Oct 2026 · engine v2',
    content: {
      lead: 'Instead of loose text dumps, recall returns **structured packets**: pinned rules first, then ranked memories with budgets, then contradiction flags — serialisable to `<memron_context>` XML for system prompts.',
      sections: [
        {
          id: 'packet-tools',
          heading: 'Packets in v2',
          body: 'Legacy `context_*` / `packet_*` tools are folded into `memory_recall`:\n\n1. **Budgeting** — pass `budget` (else inferred from query complexity, max `10,000` tokens).\n2. **Scoping** — pass `space` (e.g. `project:helios`) to isolate namespaces.\n3. **Serialising** — format results as `<memron_context><pinned_rule/>…<memory pointer title/>…</memron_context>` before injecting into your system prompt.\n4. **Validating** — run `memory_validate` before consequential actions to check the packet against constraints.',
          codeExample: {
            language: 'xml',
            tabs: [
              {
                label: 'memron_context.xml',
                lang: 'xml',
                code: `<memron_context budget="1500" query="DB conventions?">\n  <pinned_rule>Backend uses Postgres pgvector, snake_case tables.</pinned_rule>\n  <memory pointer="ptr_89aB12" title="Schema convention" score="0.94">\n    All tables include id SERIAL PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT NOW().\n  </memory>\n  <contradictions>none detected</contradictions>\n</memron_context>`,
              },
            ],
          },
        },
      ],
    },
  },

  'recipes-playbooks': {
    id: 'recipes-playbooks',
    slug: 'recipes-playbooks',
    title: 'Recipes & Distillation',
    category: 'MCP Tools (8 active)',
    badge: 'Playbooks',
    description: 'Reusable procedures stored as memories, ranked by feedback.',
    readTime: '4 min read',
    updated: 'Oct 2026 · engine v2',
    content: {
      lead: 'Recipes are **procedural memories** (L4): distilled multi-step playbooks for debugging, deploys, migrations. Store them with `memory_store`, find them with `memory_recall`, tune them with `memory_manage { action: "feedback" }`.',
      sections: [
        {
          id: 'recipe-tools',
          heading: 'Recipe lifecycle in v2',
          body: '1. **Create** — `memory_store` with steps in `content` and tags like `["recipe", "deploy"]`. Set `importance: 0.8` to rank above chatter.\n2. **Find** — `memory_recall` with the task description; procedural matches rank via vector + BM25.\n3. **Tune** — `memory_manage { action: "feedback", feedback: { success: true, rating: 5 } }` after each run.\n4. **Evolve** — `action: "update"` to revise steps; a forensic snapshot preserves the old version.',
          table: {
            headers: ['Old tool', 'v2 equivalent', 'Notes'],
            rows: [
              ['`recipe_search`', '`memory_recall { query: task }`', 'Procedural recall, same ranking'],
              ['`recipe_create`', '`memory_store { content: steps }`', 'Tag with recipe + domain'],
              ['`recipe_feedback`', '`memory_manage { action: "feedback" }`', 'Tunes confidence over runs'],
              ['`recipe_get`', 'Recall result `content`', 'Full steps inline'],
            ],
          },
        },
      ],
    },
  },

  'preferences-ingest': {
    id: 'preferences-ingest',
    slug: 'preferences-ingest',
    title: 'Ingestion & Preferences',
    category: 'MCP Tools (8 active)',
    badge: 'Analysis',
    description: 'Background extraction of facts, prefs, and contradictions.',
    readTime: '4 min read',
    updated: 'Oct 2026 · engine v2',
    content: {
      lead: 'Ingestion runs **after** the store returns. Background workers extract atomic facts, user preferences, and contradictions — then queue embeddings and graph edges. The write path stays fast; understanding catches up within seconds.',
      sections: [
        {
          id: 'ingestion-tools',
          heading: 'Pipeline stages',
          body: '1. **Store (sync)** — encrypt, embed once, classify bucket, return `pointerId`.\n2. **Index (queued)** — `memory_index_jobs`: graph extraction, re-embed on failure, dead-letter after retries.\n3. **Analyse (queued)** — `analysis_jobs`: contradiction detection, preference extraction, decay rescoring.\n4. **Observe** — `system_diagnostics` shows queue depths and failures; `memory_debug` autopsies one pointer.',
          table: {
            headers: ['Old tool', 'v2 equivalent', 'Notes'],
            rows: [
              ['`memory_ingest`', 'Automatic post-store', 'No manual transcript parsing needed'],
              ['`memory_analyze`', 'Automatic `analysis_jobs`', 'Contradictions + decay rescoring'],
              ['`preference_extract/get`', '`memory_recall { query }`', 'Prefs are high-importance memories'],
            ],
          },
        },
      ],
    },
  },

  'prompt-versioning-runs': {
    id: 'prompt-versioning-runs',
    slug: 'prompt-versioning-runs',
    title: 'Prompt Versioning & Runs',
    category: 'MCP Tools (8 active)',
    badge: 'Observability',
    description: 'Immutable prompt versions + execution telemetry in the dashboard.',
    readTime: '5 min read',
    updated: 'Oct 2026 · engine v2',
    content: {
      lead: 'Versioning and run telemetry live in the **dashboard and analytics tables**, not in the agent tool surface. Agents stay on 4 verbs; operators get full observability without bloating the model context.',
      sections: [
        {
          id: 'prompt-tools',
          heading: 'Prompt lifecycle (dashboard)',
          body: 'Register templates, cut immutable semantic versions, promote one to active, diff any two, and fetch raw text per version. Storing with `type: run_event` metadata also records a run row alongside the memory artifact — analytics stay connected to the 4-verb API.',
          table: {
            headers: ['Capability', 'Where', 'Notes'],
            rows: [
              ['Template + version CRUD', 'Dashboard / versioning module', 'Immutable versions, active pointer'],
              ['Version diff + history', 'Dashboard', 'Side-by-side changelog'],
              ['Run records', 'Automatic on recall/store', 'Tokens, latency, model params'],
              ['Hallucination flags', 'Run telemetry', 'Contradiction + drift surfacing'],
            ],
          },
          alert: {
            type: 'note',
            title: 'Why not MCP tools?',
            message: 'Prompt admin is human-in-the-loop work. Keeping it out of MCP saves context for the agent and prevents accidental version churn from autonomous runs.',
          },
        },
      ],
    },
  },

  'cursor-setup': {
    id: 'cursor-setup',
    slug: 'cursor-setup',
    title: 'Cursor IDE Integration',
    category: 'Agent Integrations',
    description: 'Project or global mcp.json plus a .cursorrules directive.',
    readTime: '3 min read',
    updated: 'Oct 2026 · engine v2',
    content: {
      lead: 'Give Cursor persistent memory in two files: **connection** (`.cursor/mcp.json`) and **policy** (`.cursorrules`). HTTP transport, bearer auth, done.',
      sections: [
        {
          id: 'configuration',
          heading: '1. Connection',
          body: 'Create `.cursor/mcp.json` at project root (or `~/.cursor/mcp.json` globally). Cursor speaks HTTP natively — no `mcp-remote` shim needed.',
          codeExample: {
            language: 'json',
            tabs: [
              {
                label: '.cursor/mcp.json',
                lang: 'json',
                code: `{\n  "mcpServers": {\n    "memron": {\n      "url": "http://localhost:4201/mcp",\n      "headers": { "Authorization": "Bearer mm_live_YOUR_KEY" }\n    }\n  }\n}`,
              },
              {
                label: '.cursorrules',
                lang: 'markdown',
                code: `You have Memron persistent memory (4 verbs).\n1. Before non-trivial work, call memory_recall with the task.\n2. After solving something hard, call memory_store with the finding.\n3. Before consequential actions, call memory_validate.\n4. Respect pinned rules — they are hard constraints.`,
              },
            ],
          },
        },
        {
          id: 'verify-cursor',
          heading: '2. Verify',
          body: 'Restart Cursor, open **Settings → Features → MCP** — `memron` should list **8 tools**. In chat, ask **“What do you remember about our DB conventions?”** If recall answers from memory instead of guessing, the wiring holds.',
        },
      ],
    },
  },

  'vscode-mcp': {
    id: 'vscode-mcp',
    slug: 'vscode-mcp',
    title: 'VS Code & Roo/Cline',
    category: 'Agent Integrations',
    description: 'Copilot, Cline, Roo Code, Windsurf, and Warp wiring.',
    readTime: '3 min read',
    updated: 'Oct 2026 · engine v2',
    content: {
      lead: 'VS Code-family agents share one pattern: **HTTP where headers are supported, `mcp-remote` over stdio where they are not.** Endpoint and bearer header never change.',
      sections: [
        {
          id: 'settings',
          heading: 'Configurations',
          body: '**GitHub Copilot (VS Code)** uses `.vscode/mcp.json` with `type: http`. **Cline / Roo Code** configure via their MCP settings UI with `mcp-remote`. **Windsurf** uses `~/.codeium/windsurf/mcp_config.json` with `serverUrl`. All three carry the same `Authorization: Bearer mm_live_…` header.',
          codeExample: {
            language: 'json',
            tabs: [
              {
                label: 'VS Code (.vscode/mcp.json)',
                lang: 'json',
                code: `{\n  "servers": {\n    "memron": {\n      "type": "http",\n      "url": "http://localhost:4201/mcp",\n      "headers": { "Authorization": "Bearer mm_live_YOUR_KEY" }\n    }\n  }\n}`,
              },
              {
                label: 'Cline / Roo (stdio)',
                lang: 'json',
                code: `{\n  "mcpServers": {\n    "memron": {\n      "command": "npx",\n      "args": [\n        "-y", "mcp-remote",\n        "http://localhost:4201/mcp",\n        "--header", "Authorization: Bearer mm_live_YOUR_KEY"\n      ]\n    }\n  }\n}`,
              },
              {
                label: 'Windsurf',
                lang: 'json',
                code: `{\n  "mcpServers": {\n    "memron": {\n      "serverUrl": "http://localhost:4201/mcp",\n      "headers": { "Authorization": "Bearer mm_live_YOUR_KEY" }\n    }\n  }\n}`,
              },
            ],
          },
        },
      ],
    },
  },

  'claude-desktop': {
    id: 'claude-desktop',
    slug: 'claude-desktop',
    title: 'Claude Code & Desktop',
    category: 'Agent Integrations',
    description: 'Desktop via mcp-remote, CLI via HTTP — one memory everywhere.',
    readTime: '3 min read',
    updated: 'Oct 2026 · engine v2',
    content: {
      lead: 'Claude Desktop only speaks **stdio**, so it goes through `mcp-remote`. Claude Code (CLI) can hit **HTTP directly**. Both share the same key and the same memory.',
      sections: [
        {
          id: 'claude-config',
          heading: 'Configurations',
          body: 'Desktop config lives at `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS), `%APPDATA%\\Claude\\claude_desktop_config.json` (Windows), or `~/.config/Claude/claude_desktop_config.json` (Linux). No build step — `npx -y mcp-remote` fetches the bridge on first run.',
          codeExample: {
            language: 'json',
            tabs: [
              {
                label: 'claude_desktop_config.json',
                lang: 'json',
                code: `{\n  "mcpServers": {\n    "memron": {\n      "command": "npx",\n      "args": [\n        "-y", "mcp-remote",\n        "http://localhost:4201/mcp",\n        "--header", "Authorization: Bearer mm_live_YOUR_KEY"\n      ]\n    }\n  }\n}`,
              },
              {
                label: 'Claude Code (CLI)',
                lang: 'bash',
                code: `curl -X POST http://localhost:4201/mcp \\\n  -H "Authorization: Bearer mm_live_YOUR_KEY" \\\n  -H "Content-Type: application/json" \\\n  -H "Accept: application/json, text/event-stream" \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'`,
              },
            ],
          },
        },
      ],
    },
  },

  'typescript-python-sdk': {
    id: 'typescript-python-sdk',
    slug: 'typescript-python-sdk',
    title: 'TypeScript & Python SDK',
    category: 'Agent Integrations',
    description: 'Direct HTTPS (POST /v1/store, /v1/recall) for custom runtimes.',
    readTime: '4 min read',
    updated: 'Oct 2026 · engine v2',
    content: {
      lead: 'Custom runtimes (LangChain, LlamaIndex, AutoGen, CrewAI) do not need MCP framing — the **same v2 contract** is exposed as plain HTTPS: `POST /v1/store` takes `content`, `POST /v1/recall` takes `query`.',
      sections: [
        {
          id: 'sdk-examples',
          heading: 'Direct HTTPS examples',
          body: 'Same minimal schema as MCP. Auth is still `Bearer mm_live_…`. Responses include `pointerId`, bucket, and token accounting — format results as `<memron_context>` XML before injecting into your system prompt.',
          codeExample: {
            language: 'typescript',
            tabs: [
              {
                label: 'TypeScript',
                lang: 'typescript',
                code: `const res = await fetch("http://localhost:4201/v1/store", {\n  method: "POST",\n  headers: {\n    "Authorization": "Bearer " + process.env.MEMRON_API_KEY!,\n    "Content-Type": "application/json",\n  },\n  body: JSON.stringify({\n    content: "Use App Router + server actions; snake_case tables.",\n    tags: ["frontend", "nextjs"],\n  }),\n});\nconst { pointerId } = await res.json();\n// -> { pointerId: "ptr_89aB12", bucket: "knowledge", ... }`,
              },
              {
                label: 'Python',
                lang: 'python',
                code: `import os, requests\n\nr = requests.post(\n    "http://localhost:4201/v1/recall",\n    headers={"Authorization": f"Bearer {os.environ['MEMRON_API_KEY']}"},\n    json={"query": "How should Next.js routes be configured?"},\n    timeout=30,\n)\npacket = r.json()\nxml = "<memron_context>\\n" + "\\n".join(\n    f'  <memory pointer="{m["pointerId"]}">{m["content"]}</memory>'\n    for m in packet["results"]\n) + "\\n</memron_context>"`,
              },
            ],
          },
        },
      ],
    },
  },

  'auth-identity': {
    id: 'auth-identity',
    slug: 'auth-identity',
    title: 'WorkOS AuthKit & Keys',
    category: 'REST API & Identity',
    badge: 'AuthKit',
    description: 'Human SSO via WorkOS, agent auth via hashed bearer keys.',
    readTime: '3 min read',
    updated: 'Oct 2026 · engine v2',
    content: {
      lead: 'Humans authenticate with **WorkOS AuthKit** (SSO, OAuth, magic links, passkeys). Agents authenticate with **`mm_live_…` bearer keys** — `SHA-256` hashed at rest, cached for 5 minutes, revocable per key.',
      sections: [
        {
          id: 'authkit-integration',
          heading: 'Human flow (WorkOS AuthKit)',
          body: 'Sign in at `/login` or `/sign-up`. WorkOS returns verified session credentials stored in `httpOnly` cookies (`wos-session`). Profiles sync to Postgres and link to workspace organisations. `profile_get` lets any bearer key prove which account it belongs to.',
        },
        {
          id: 'api-key-auth',
          heading: 'Agent flow (bearer keys)',
          body: 'Agents send `Authorization: Bearer mm_live_<secret>` on every `/mcp` and `/v1/*` call. The server hashes the secret, checks the **in-memory cache (5-min TTL)**, and queries `api_keys` on miss. Wrong or revoked keys fail closed with no oracle — the error never says which half was wrong.',
          alert: {
            type: 'warning',
            title: 'Key hygiene',
            message: 'One key per runtime, least privilege per bucket, rotate on personnel change. A leaked key is revoked in the dashboard — expiry follows within the 5-minute cache window.',
          },
        },
      ],
    },
  },

  'rest-endpoints': {
    id: 'rest-endpoints',
    slug: 'rest-endpoints',
    title: 'Dashboard REST APIs',
    category: 'REST API & Identity',
    badge: 'REST',
    description: 'Memories, keys, buckets, graph, playground, and health.',
    readTime: '4 min read',
    updated: 'Oct 2026 · engine v2',
    content: {
      lead: 'The Next.js backend exposes **dashboard REST endpoints** for everything humans do: triage memories, mint keys, manage buckets, visualise the graph, and test recall in the Playground.',
      sections: [
        {
          id: 'endpoints-table',
          heading: 'Endpoint catalog',
          table: {
            headers: ['Method', 'Endpoint', 'Purpose'],
            rows: [
              ['`GET / POST`', '`/api/dashboard/memories`', 'List recent memories or store one manually'],
              ['`GET / POST / DELETE`', '`/api/dashboard/keys`', 'List, mint (`mm_live_…`), or revoke keys'],
              ['`GET / POST`', '`/api/dashboard/buckets`', 'List or create isolated memory buckets'],
              ['`GET`', '`/api/dashboard/graph`', 'Nodes + edges for the graph canvas'],
              ['`POST`', '`/api/dashboard/playground`', 'Test recall + RAG grounded on `gpt-4o-mini`'],
              ['`GET`', '`/api/health`', 'DB pool + service status probe'],
            ],
          },
        },
        {
          id: 'agent-vs-human',
          heading: 'Agent vs. human surfaces',
          body: 'Agents use **MCP (`/mcp`)** or **direct HTTPS (`/v1/store`, `/v1/recall`)** with bearer keys. Humans use **dashboard REST** with WorkOS sessions. The two never mix credentials — a stolen session cookie cannot call MCP, and a bearer key cannot open the dashboard.',
        },
      ],
    },
  },
};
