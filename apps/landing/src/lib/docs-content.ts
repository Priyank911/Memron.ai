export interface DocItem {
  id: string;
  slug: string;
  title: string;
  category: string;
  badge?: string;
  badgeType?: 'default' | 'mcp' | 'post' | 'get' | 'new';
  description: string;
  readTime: string;
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
    title: 'MCP Tools Reference (41 Tools)',
    icon: 'Terminal',
    items: [
      { id: 'mcp-overview', slug: 'mcp-overview', title: 'MCP Protocol Overview', badge: 'MCP' },
      { id: 'memory-tools', slug: 'memory-tools', title: 'Memory CRUD & History', badge: '7 Tools' },
      { id: 'pinned-facts', slug: 'pinned-facts', title: 'Pinned Facts (Always-Injected)', badge: 'New' },
      { id: 'knowledge-graph', slug: 'knowledge-graph', title: 'Knowledge Graph & Paths', badge: '7 Tools' },
      { id: 'context-packets', slug: 'context-packets', title: 'Context Packets & XML', badge: 'Anti-Drift' },
      { id: 'recipes-playbooks', slug: 'recipes-playbooks', title: 'Recipes & Distillation', badge: '4 Tools' },
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
    description: 'Context Intelligence & Memory Orchestration Layer for AI agents.',
    readTime: '3 min read',
    content: {
      lead: 'Memron is the unified memory backbone for autonomous agents. It transforms raw conversational history into encrypted, high-fidelity memory packets that survive across sessions, runtimes, and models.',
      sections: [
        {
          id: 'the-three-problems',
          heading: 'The 3 Critical Limitations of Current AI Agents',
          body: 'Every frontier agent today (Claude, Cursor, Codex, OpenAI Operator) struggles with three severe operational bottlenecks:\n\n1. **Context Amnesia**: Every new session starts tabula rasa. Agents forget what failed, what edge cases were discovered, and what architectural constraints your team enforced.\n2. **Token Waste**: Replaying 15,000 to 40,000 raw tokens of past conversation to recover context burns massive tokens on redundant discovery.\n3. **Hallucination Drift**: Without grounded, immutable facts from prior interactions, agents confabulate library versions, invent fake API endpoints, and contradict past verified approaches.',
          alert: {
            type: 'important',
            title: 'The Two Core Guarantees of Memron',
            message: 'Memron guarantees: (1) ~90% reduction in token burn via 3-token memory pointers, and (2) 40% to 70% reduction in factual hallucination using grounded anti-hallucination context packets.',
          },
        },
        {
          id: 'the-solution',
          heading: 'How Memron Solves Memory',
          body: 'Memron provides a 7-layer memory hierarchy with an automated analysis pipeline and 41 Model Context Protocol (MCP) tools. Raw conversational streams are automatically parsed, atomic facts extracted, relationships linked into a blind-indexed knowledge graph, and temporal decay calculated according to the Ebbinghaus forgetting curve.',
          table: {
            headers: ['Pillar', 'What It Does', 'Core Metric'],
            rows: [
              ['7-Layer Architecture', 'Structures memory into working, episodic, semantic, procedural, evaluative, social, and archive layers.', 'Deterministic recall across session boundaries'],
              ['Analysis Pipeline', 'Extracts atomic facts, entities, workflows, and contradiction checks via gpt-4o-mini.', '~90% token compression ratio'],
              ['41 MCP Tools', 'Exposes zero-configuration memory tools directly to Claude, Cursor, VS Code, and custom runtimes.', 'Zero-integration plug-and-play'],
            ],
          },
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
    description: 'Connect Cursor, Claude Code, or VS Code to Memron in under 3 minutes.',
    readTime: '3 min read',
    content: {
      lead: 'Connect your favorite AI agent runtime to Memron.ai using the official Model Context Protocol (MCP) server.',
      sections: [
        {
          id: 'step-1-get-api-key',
          heading: '1. Generate Your Sovereign API Key',
          body: 'Sign in to the Memron Dashboard and navigate to API Keys. Click Create API Key and copy your sovereign live key (mm_live_...). Keys are hashed using SHA-256 and mirrored directly to the MCP gateway.',
          alert: {
            type: 'tip',
            title: 'Zero-Trust Architecture',
            message: 'Your API key is only shown once upon creation. Store it in your local environment or password manager.',
          },
        },
        {
          id: 'step-2-connect-mcp',
          heading: '2. Configure Your Agent Runtime',
          body: 'Add the Memron MCP server definition to your agent client configuration file.',
          codeExample: {
            language: 'json',
            tabs: [
              {
                label: 'Cursor (~/.cursor/mcp.json)',
                lang: 'json',
                code: `{\n  "mcpServers": {\n    "memron": {\n      "url": "http://localhost:4201/mcp",\n      "headers": {\n        "Authorization": "Bearer mm_live_YOUR_API_KEY_HERE"\n      }\n    }\n  }\n}`,
              },
              {
                label: 'Claude Desktop',
                lang: 'json',
                code: `{\n  "mcpServers": {\n    "memron": {\n      "command": "npx",\n      "args": ["-y", "@memron/mcp-server"],\n      "env": {\n        "MEMRON_API_KEY": "mm_live_YOUR_API_KEY_HERE"\n      }\n    }\n  }\n}`,
              },
              {
                label: 'cURL Verification',
                lang: 'bash',
                code: `curl -X POST http://localhost:4201/mcp \\\n  -H "Authorization: Bearer mm_live_YOUR_API_KEY_HERE" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "jsonrpc": "2.0",\n    "method": "tools/list",\n    "id": 1\n  }'`,
              },
            ],
          },
        },
        {
          id: 'step-3-test-tools',
          heading: '3. Storing and Recalling Your First Memory',
          body: 'Ask your agent: "Remember that our backend uses PostgreSQL pgvector with 1536-dimension embeddings and strict snake_case table conventions."\n\nThe agent will invoke memory_store, encrypt the content via AES-256-GCM, generate a 3-token pointer (e.g. ptr_7xK9q2), and save it to your default workspace bucket.',
        },
      ],
    },
  },

  'architecture-overview': {
    id: 'architecture-overview',
    slug: 'architecture-overview',
    title: '7-Layer Memory Model',
    category: 'Getting Started',
    description: 'Deep architectural overview of the 7 cognitive layers powering Memron.',
    readTime: '5 min read',
    content: {
      lead: 'Just like human biological cognition, artificial agents require layered memory tiers that balance immediate working context against long-term procedural workflows and immutable facts.',
      sections: [
        {
          id: 'the-7-layers',
          heading: 'The 7 Cognitive Memory Tiers',
          body: 'Memron organises agent knowledge into seven structured layers:',
          table: {
            headers: ['Layer', 'Name', 'Storage & Lifecycle', 'Typical Content'],
            rows: [
              ['Layer 1', 'Working Memory', 'In-memory ephemeral / session cache', 'Current prompt state, active files, temporary scratchpad'],
              ['Layer 2', 'Episodic Memory', 'PostgreSQL episodes table', 'Past conversation turns, user intents, task attempts'],
              ['Layer 3', 'Semantic Memory', 'pgvector embeddings + graph_nodes', 'Distilled atomic facts, user coding standards, invariants'],
              ['Layer 4', 'Procedural Memory', 'success_recipes table', 'Reusable how-to playbooks, debugging recipes, build steps'],
              ['Layer 5', 'Evaluative Memory', 'run_traces & hallucination flags', 'Failure cases, anti-patterns, contradiction detection'],
              ['Layer 6', 'Social Memory', 'trust_registry & shared buckets', 'Cross-agent transferable context, team guidelines'],
              ['Layer 7', 'Archive Memory', 'Sovereign encrypted forensic snapshots', 'Raw immutable conversation audit trail'],
            ],
          },
        },
        {
          id: 'memory-pointers',
          heading: 'Context Compression via 3-Token Pointers',
          body: 'Instead of injecting full raw conversation histories into agent system prompts, Memron replaces dense context with lightweight pointers (e.g., ^ptr_82a1f). When the agent specifically requires the underlying data during reasoning, it calls memory_get(pointerId) or includes the pre-compiled anti-hallucination packet.',
          alert: {
            type: 'note',
            title: 'Token Economics',
            message: 'A 500-token paragraph compresses into a single 3-token pointer. Across a 20-turn agent trajectory, this prevents over 120,000 redundant tokens from entering context windows.',
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
    description: 'High-availability dual-database synchronization between Primary Aiven DB and Supabase Vector Node.',
    readTime: '4 min read',
    content: {
      lead: 'Memron utilizes a resilient dual-database design to isolate high-throughput web operations from intensive vector similarity searches and agent MCP tool executions.',
      sections: [
        {
          id: 'database-responsibilities',
          heading: 'Primary Web DB vs. Supabase Agent Node',
          body: '1. Primary Web App DB (Aiven PostgreSQL): Handles WorkOS AuthKit sessions, dashboard analytics, user accounts, bucket access policies, and primary key registries.\n2. MCP Sovereign Node (Supabase PostgreSQL + pgvector): Houses vector embeddings (1536 dimensions), blind-indexed graph nodes (graph_nodes), temporal edges (graph_edges), and the real-time API key verification cache (SELECT * FROM api_keys WHERE key_hash = $1).\n3. Firebase Cloud Storage: Provides cloud backup redundancy for cross-region disaster recovery.',
        },
        {
          id: 'self-healing-sync',
          heading: 'Self-Healing Sync Contract',
          body: 'Whenever an API key is provisioned or revoked in the Next.js frontend, apps/landing/src/lib/supabase-sync.ts opportunistically mirrors the record to Supabase. If the user does not yet exist in Supabase, the engine auto-provisions the user identity, default workspace organization, and sets is_active = true on the fly.',
          codeExample: {
            language: 'typescript',
            tabs: [
              {
                label: 'Self-Healing User Resolution',
                lang: 'typescript',
                code: `// apps/landing/src/lib/supabase-sync.ts\nconst supabaseUser = await resolveOrProvisionSupabaseUser({\n  authUserId: user.id,\n  email: user.email,\n  name: user.name,\n});\n\n// Mirror API key hash to Supabase for sub-millisecond MCP auth\nawait syncApiKeyToSupabase({\n  keyId: newKey.id,\n  keyHash: newKey.key_hash,\n  keyPrefix: newKey.key_prefix,\n  name: newKey.name,\n  userId: supabaseUser.id,\n});`,
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
    description: '4-Signal Reciprocal Rank Fusion combining Vector, BM25, Graph, and Ebbinghaus Decay.',
    readTime: '4 min read',
    content: {
      lead: 'Standard vector similarity searches fail when exact keywords, temporal recency, or complex multi-hop entity relationships are required. Memron fuses four orthogonal signals using Reciprocal Rank Fusion (RRF).',
      sections: [
        {
          id: 'the-4-signals',
          heading: 'The 4 Retrieval Signals',
          body: 'The hybrid retrieval orchestrator executes four searches concurrently:\n\n1. Vector Cosine Similarity (Weight: 1.0): HNSW vector search on 1536-dimensional embeddings generated by OpenAI text-embedding-3-small.\n2. BM25 Full-Text (Weight: 0.8): PostgreSQL tsvector and ts_rank_cd for exact keyword matches, symbol names, and acronyms.\n3. Knowledge Graph Traversal (Weight: 1.2): Blind-hash anchor discovery followed by recursive CTE N-hop expansion.\n4. Ebbinghaus Memory Decay (Weight: 0.6): Exponential time decay with a configurable 7-day half-life and frequency reinforcement.',
          alert: {
            type: 'tip',
            title: 'RRF Formula',
            message: 'Score(d) = Σ [ w_i / (k + rank_i(d)) ], where k = 60. By focusing on rank positions rather than raw incompatible score distributions, RRF ensures balanced fusion across all signals.',
          },
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
    description: 'Migration to OpenAI gpt-4o-mini and text-embedding-3-small for cost efficiency and deterministic recall.',
    readTime: '3 min read',
    content: {
      lead: 'Memron has transitioned to OpenAI high-performance, cost-effective models across all analysis pipelines and Playground RAG orchestrations.',
      sections: [
        {
          id: 'model-allocations',
          heading: 'Model Configuration',
          table: {
            headers: ['Task', 'Selected Model', 'Temperature', 'Purpose'],
            rows: [
              ['Playground RAG & Context Recall', 'gpt-4o-mini', '0.0 (Deterministic)', 'Grounds assistant responses strictly on retrieved memory context.'],
              ['Analysis & Fact Extraction', 'gpt-4o-mini', '0.1 (Structured JSON)', 'Extracts atomic facts, entities, and relationships into JSON schemas.'],
              ['Vector Embeddings', 'text-embedding-3-small', 'N/A (1536 dims)', 'Generates semantic vectors for HNSW indexing in PostgreSQL pgvector.'],
              ['Memory Title Generation', 'gpt-4o-mini', '0.3', 'Summarizes extracted memories into concise 3-word titles.'],
            ],
          },
        },
      ],
    },
  },

  'encryption-security': {
    id: 'encryption-security',
    slug: 'encryption-security',
    title: 'AES-256 & Blind Indexing',
    category: 'Core Engine & Retrieval',
    description: 'Hardware-grade zero-knowledge encryption and HMAC blind indexing.',
    readTime: '4 min read',
    content: {
      lead: 'Memron is designed for zero-trust environments. The central server can store and traverse entity graphs without having visibility into the plaintext content.',
      sections: [
        {
          id: 'aes-256-gcm',
          heading: 'Payload Encryption (AES-256-GCM)',
          body: 'All memory contents, notes, and graph node properties are encrypted using AES-256 in Galois/Counter Mode (GCM). Each entry generates a unique 12-byte initialization vector (iv) and 16-byte authentication tag (tag) preventing tampering.',
        },
        {
          id: 'blind-indexing',
          heading: 'HMAC-SHA256 Blind Indexing',
          body: 'To allow the database to query and connect graph entities without exposing entity names in plaintext, Memron computes a deterministic blind hash: HMAC_SHA256(blind_key, normalize(entity_name) + ":" + user_id). The server traverses edges and detects relationship clusters using only these 32-character hashes.',
        },
      ],
    },
  },

  'mcp-overview': {
    id: 'mcp-overview',
    slug: 'mcp-overview',
    title: 'MCP Protocol Overview',
    category: 'MCP Tools Reference (41 Tools)',
    badge: 'Protocol',
    description: 'Model Context Protocol architecture, JSON-RPC schema, and transports.',
    readTime: '3 min read',
    content: {
      lead: 'The Model Context Protocol (MCP) is an open standard that allows frontier AI models to securely connect to external data sources and execution tools.',
      sections: [
        {
          id: 'server-architecture',
          heading: 'Memron MCP Architecture',
          body: 'The Memron MCP server runs as a standalone microservice (services/mcp-server) mounted on HTTP endpoint /mcp. It supports:\n\n- Streamlined JSON-RPC 2.0 transport\n- Sub-5ms in-memory API key authorization cache\n- Zod input schema validation\n- Automatic AES-256-GCM decryption for tool outputs',
        },
      ],
    },
  },

  'memory-tools': {
    id: 'memory-tools',
    slug: 'memory-tools',
    title: 'Memory CRUD & History',
    category: 'MCP Tools Reference (41 Tools)',
    badge: 'Core Tools',
    description: 'Full reference for memory_store, memory_search, memory_get, memory_list, memory_update, memory_delete, memory_history.',
    readTime: '6 min read',
    content: {
      lead: 'The core memory tools allow agents to create, search, list, read, update, and audit forensic changes to encrypted memories.',
      sections: [
        {
          id: 'tool-reference',
          heading: 'Tools Catalog',
          table: {
            headers: ['Tool Name', 'Parameters', 'Return Type', 'Description'],
            rows: [
              ['memory_store', 'content (str), title? (str), tags? (str[]), bucket? (str)', '{ pointerId, status }', 'Encrypts and stores a new memory with vector embeddings.'],
              ['memory_search', 'query (str), limit? (num), bucket? (str)', '{ results: Memory[] }', 'Hybrid vector + keyword search over encrypted memories.'],
              ['memory_get', 'pointerId (str)', '{ content, title, tags, timestamps }', 'Retrieves and decrypts a specific memory by its pointer ID.'],
              ['memory_list', 'bucket?, tags?, limit?, offset?, sortBy?', '{ items: [], totalCount }', 'Paginated metadata listing of memories without decrypting payloads.'],
              ['memory_update', 'pointerId (str), content?, title?, tags?', '{ pointerId, updated: true }', 'Updates a memory with an immutable forensic snapshot.'],
              ['memory_delete', 'pointerId (str)', '{ success: true }', 'Soft-deletes / archives a memory by pointer ID.'],
              ['memory_history', 'pointerId? (str), entityName? (str)', '{ timeline: [] }', 'Returns chronological audit trail showing how a fact changed over time.'],
            ],
          },
        },
        {
          id: 'code-example',
          heading: 'Example: Invoking memory_store',
          body: 'Here is an example JSON-RPC payload sent by an MCP agent to store a memory:',
          codeExample: {
            language: 'json',
            tabs: [
              {
                label: 'Request',
                lang: 'json',
                code: `{\n  "jsonrpc": "2.0",\n  "method": "tools/call",\n  "params": {\n    "name": "memory_store",\n    "arguments": {\n      "title": "Database Schema Convention",\n      "content": "All tables must include id SERIAL PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT NOW(), and updated_at triggers.",\n      "tags": ["database", "postgresql", "standards"],\n      "bucket": "engineering"\n    }\n  },\n  "id": 101\n}`,
              },
              {
                label: 'Response',
                lang: 'json',
                code: `{\n  "jsonrpc": "2.0",\n  "result": {\n    "content": [\n      {\n        "type": "text",\n        "text": "{\\"pointerId\\": \\"ptr_89aB12\\", \\"status\\": \\"stored\\", \\"tokensSaved\\": 48}"\n      }\n    ]\n  },\n  "id": 101\n}`,
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
    category: 'MCP Tools Reference (41 Tools)',
    badge: 'Sovereign',
    description: 'Tools for memory_pin, memory_unpin, and memory_list_pins.',
    readTime: '4 min read',
    content: {
      lead: 'Pinned facts bypass standard vector similarity retrieval completely. Any fact pinned to a user workspace is automatically injected into the root of every compiled context packet.',
      sections: [
        {
          id: 'pinned-tools',
          heading: 'Pinned Facts Tool Suite',
          table: {
            headers: ['Tool Name', 'Parameters', 'Behavior'],
            rows: [
              ['memory_pin', 'content (str, max 500), label (str), priority? (0-10)', 'Encrypts and inserts a permanent rule into pinned_facts table.'],
              ['memory_unpin', 'pinId (str)', 'Soft-deletes the pinned rule so it is no longer injected.'],
              ['memory_list_pins', 'None', 'Decrypts and lists all active pinned facts ordered by priority DESC.'],
            ],
          },
          alert: {
            type: 'important',
            title: 'Token Economy Warning',
            message: 'Because pinned facts are injected into EVERY agent conversation turn, keep each pinned fact under 500 characters. Use them strictly for critical invariants like styling conventions, security constraints, or project rules.',
          },
        },
      ],
    },
  },

  'knowledge-graph': {
    id: 'knowledge-graph',
    slug: 'knowledge-graph',
    title: 'Knowledge Graph & Paths',
    category: 'MCP Tools Reference (41 Tools)',
    badge: 'Graph',
    description: 'Reference for graph_query, graph_paths, graph_hubs, graph_by_type, graph_stats, graph_add_entity, graph_add_relationship.',
    readTime: '5 min read',
    content: {
      lead: 'Memron builds a sovereign knowledge graph that links concepts, people, repositories, and preferences via bi-temporal edges.',
      sections: [
        {
          id: 'graph-tools',
          heading: 'Graph Tools Catalog',
          table: {
            headers: ['Tool Name', 'Parameters', 'Description'],
            rows: [
              ['graph_query', 'entityName (str), maxDepth? (num)', 'Blind-hashes entityName and recursively traverses N-hop subgraph.'],
              ['graph_paths', 'sourceEntity (str), targetEntity (str)', 'Finds relationship paths connecting two entities.'],
              ['graph_hubs', 'limit? (num)', 'Identifies the most interconnected entity nodes across the workspace.'],
              ['graph_by_type', 'entityType (str), limit? (num)', 'Filters entities by concept, technology, preference, or project.'],
              ['graph_stats', 'None', 'Returns total node count, active edges, and density score.'],
              ['graph_add_entity', 'name (str), entityType (str), payload? (obj)', 'Inserts an encrypted graph node with HMAC blind hash.'],
              ['graph_add_relationship', 'sourceNodeId (str), targetNodeId (str), relationship (str)', 'Establishes a bi-temporal edge between two nodes.'],
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
    category: 'MCP Tools Reference (41 Tools)',
    badge: 'Context',
    description: 'Tools for building structured, anti-hallucination XML context blocks for LLM prompts.',
    readTime: '4 min read',
    content: {
      lead: 'Instead of dumping loose text into prompt history, Memron structures memory into verified <memory_context> XML blocks with confidence scores and contradiction warnings.',
      sections: [
        {
          id: 'packet-tools',
          heading: 'Context Packet Tools',
          table: {
            headers: ['Tool Name', 'Parameters', 'Purpose'],
            rows: [
              ['context_build', 'query (str), tokenBudget? (num)', 'Retrieves and ranks memories within a specified token budget.'],
              ['context_packet', 'query (str), taskType? (str)', 'Builds a multi-signal anti-hallucination context packet.'],
              ['context_packet_format', 'packetId (str)', 'Serializes the context packet into standardized <memory_context> XML.'],
              ['context_packet_get', 'packetId (str)', 'Fetches an existing context packet record by ID.'],
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
    category: 'MCP Tools Reference (41 Tools)',
    badge: 'Playbooks',
    description: 'Reference for recipe_search, recipe_create, recipe_feedback, recipe_get.',
    readTime: '4 min read',
    content: {
      lead: 'Recipes store proven, multi-step execution playbooks. When an agent solves a tricky debugging bug or deploys an infrastructure component, it distills the workflow into a reusable recipe.',
      sections: [
        {
          id: 'recipe-tools',
          heading: 'Recipe Tools Reference',
          table: {
            headers: ['Tool Name', 'Parameters', 'Description'],
            rows: [
              ['recipe_search', 'taskDescription (str)', 'Finds matching success recipes ranked by confidence and success rate.'],
              ['recipe_create', 'title (str), steps (str[]), trigger (str)', 'Stores a verified multi-step workflow recipe.'],
              ['recipe_feedback', 'recipeId (str), success (bool)', 'Adjusts recipe confidence score based on actual agent outcome.'],
              ['recipe_get', 'recipeId (str)', 'Retrieves full step-by-step instructions for a recipe.'],
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
    category: 'MCP Tools Reference (41 Tools)',
    badge: 'Analysis',
    description: 'Tools for memory_ingest, memory_analyze, preference_extract, and preference_get.',
    readTime: '4 min read',
    content: {
      lead: 'Automated background analysis tools extract atomic facts, update user coding preferences, and resolve contradictory statements.',
      sections: [
        {
          id: 'ingestion-tools',
          heading: 'Ingestion & Analysis Tools',
          table: {
            headers: ['Tool Name', 'Parameters', 'Description'],
            rows: [
              ['memory_ingest', 'conversation (str | obj[])', 'Parses multi-turn transcripts and auto-captures episodes and memories.'],
              ['memory_analyze', 'userId? (num)', 'Executes background contradiction resolution and recalculates decay scores.'],
              ['preference_extract', 'interactionText (str)', 'Extracts explicit user constraints, preferred frameworks, and styling rules.'],
              ['preference_get', 'category? (str)', 'Returns verified user preferences and rules.'],
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
    category: 'MCP Tools Reference (41 Tools)',
    badge: 'Observability',
    description: 'Enterprise prompt versioning, session tracking, hallucination telemetry, and performance analytics.',
    readTime: '5 min read',
    content: {
      lead: 'Track every prompt iteration and agent execution run. Quantify token savings, detect hallucination events, and analyze latency trends.',
      sections: [
        {
          id: 'prompt-tools',
          heading: 'Prompt Lifecycle Management',
          table: {
            headers: ['Tool Name', 'Purpose'],
            rows: [
              ['prompt_template_create', 'Registers a new system or agent prompt template.'],
              ['prompt_version_create', 'Creates an immutable semantic version of a prompt template.'],
              ['prompt_version_activate', 'Promotes a specific prompt version to active production status.'],
              ['prompt_version_history', 'Lists changelog history for a prompt template.'],
              ['prompt_version_compare', 'Computes side-by-side visual diffs between two prompt versions.'],
              ['prompt_version_get', 'Fetches the raw prompt text for a specific version.'],
            ],
          },
        },
        {
          id: 'run-observability-tools',
          heading: 'Run Telemetry & Hallucination Flagging',
          table: {
            headers: ['Tool Name', 'Purpose'],
            rows: [
              ['run_record', 'Records execution trace, token consumption, and agent latency.'],
              ['run_feedback', 'Submits user evaluation ratings and flags factual drift.'],
              ['run_session_analytics', 'Computes aggregate latency, cost, and success metrics over time.'],
              ['run_prompt_stats', 'Analyzes performance metrics associated with a specific prompt template.'],
              ['run_hallucinations', 'Retrieves all execution runs flagged for hallucination or contradiction.'],
              ['run_get', 'Inspects full telemetry logs for an individual run ID.'],
            ],
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
    description: 'Step-by-step setup guide for Cursor IDE using .cursorrules and mcp.json.',
    readTime: '3 min read',
    content: {
      lead: 'Integrate Memron directly into Cursor so your IDE agent automatically queries past coding decisions and stores debugging insights.',
      sections: [
        {
          id: 'configuration',
          heading: '1. Add MCP Server in Cursor Settings',
          body: 'Open Cursor Settings > Features > MCP, click Add New MCP Server, and configure:',
          codeExample: {
            language: 'json',
            tabs: [
              {
                label: 'Cursor MCP Config',
                lang: 'json',
                code: `{\n  "name": "memron",\n  "type": "sse",\n  "url": "http://localhost:4201/mcp",\n  "headers": {\n    "Authorization": "Bearer mm_live_YOUR_KEY_HERE"\n  }\n}`,
              },
            ],
          },
        },
        {
          id: 'cursorrules',
          heading: '2. Project .cursorrules',
          body: 'Add this directive to your project root .cursorrules to instruct the model to leverage Memron memory on every task:',
          codeExample: {
            language: 'markdown',
            tabs: [
              {
                label: '.cursorrules',
                lang: 'markdown',
                code: `You have access to Memron persistent memory tools.\n1. Before starting non-trivial features or debugging tasks, search for past conventions using \`memory_search\`.\n2. When solving tricky bugs or architectural decisions, store the finding using \`memory_store\`.\n3. Always respect pinned rules retrieved in context packets.`,
              },
            ],
          },
        },
      ],
    },
  },

  'vscode-mcp': {
    id: 'vscode-mcp',
    slug: 'vscode-mcp',
    title: 'VS Code & Roo/Cline',
    category: 'Agent Integrations',
    description: 'Configuring VS Code with GitHub Copilot, Cline, or Roo Code.',
    readTime: '3 min read',
    content: {
      lead: 'Connect VS Code agent extensions like Cline, Roo Code, or GitHub Copilot MCP to your Memron node.',
      sections: [
        {
          id: 'settings',
          heading: 'Extension Configuration',
          body: 'Add the server definition to your extension settings JSON:',
          codeExample: {
            language: 'json',
            tabs: [
              {
                label: 'cline_mcp_settings.json',
                lang: 'json',
                code: `{\n  "mcpServers": {\n    "memron": {\n      "url": "http://localhost:4201/mcp",\n      "headers": {\n        "Authorization": "Bearer mm_live_YOUR_API_KEY_HERE"\n      }\n    }\n  }\n}`,
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
    description: 'Using Memron with Anthropic Claude Desktop and Claude Code CLI.',
    readTime: '3 min read',
    content: {
      lead: 'Give Claude continuous memory across both the Desktop application and terminal CLI sessions.',
      sections: [
        {
          id: 'claude-config',
          heading: 'Claude Desktop Configuration',
          body: 'Open claude_desktop_config.json (accessible via Claude Settings > Developer) and append:',
          codeExample: {
            language: 'json',
            tabs: [
              {
                label: 'claude_desktop_config.json',
                lang: 'json',
                code: `{\n  "mcpServers": {\n    "memron": {\n      "url": "http://localhost:4201/mcp",\n      "headers": {\n        "Authorization": "Bearer mm_live_YOUR_API_KEY_HERE"\n      }\n    }\n  }\n}`,
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
    description: 'Programmatic integration for custom autonomous agents and pipelines.',
    readTime: '4 min read',
    content: {
      lead: 'Integrate Memron directly into LangChain, LlamaIndex, AutoGen, CrewAI, or custom Node/Python agent runtimes.',
      sections: [
        {
          id: 'sdk-examples',
          heading: 'SDK Code Examples',
          codeExample: {
            language: 'typescript',
            tabs: [
              {
                label: 'TypeScript',
                lang: 'typescript',
                code: `import { MemronClient } from '@memron/sdk';\n\nconst memron = new MemronClient({\n  apiKey: process.env.MEMRON_API_KEY!,\n});\n\n// Store a memory\nconst memory = await memron.memories.store({\n  title: 'Next.js Routing Policy',\n  content: 'Use App Router with server actions and memory cache for development watch.',\n  tags: ['frontend', 'nextjs'],\n});\n\n// Query memory with RRF hybrid retrieval\nconst context = await memron.retrieval.search({\n  query: 'How should Next.js routes be configured?',\n  tokenBudget: 1500,\n});\n\nconsole.log(context.formatAsXml());`,
              },
              {
                label: 'Python',
                lang: 'python',
                code: `from memron import MemronClient\n\nclient = MemronClient(api_key="mm_live_YOUR_KEY")\n\n# Retrieve contextual memory\npacket = client.context.build(\n    query="What database migration conventions were agreed upon?",\n    token_budget=2000\n)\n\n# Inject into OpenAI or Anthropic system prompt\nsystem_prompt = f"""You are an engineering agent.\n{packet.to_xml()}\n"""`,
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
    description: 'Modern enterprise authentication via WorkOS AuthKit and SHA-256 API key hashing.',
    readTime: '3 min read',
    content: {
      lead: 'Memron utilizes WorkOS AuthKit for seamless authentication (SSO, OAuth, Magic Links, Passkeys) combined with SHA-256 API key authentication for agent clients.',
      sections: [
        {
          id: 'authkit-integration',
          heading: 'WorkOS AuthKit Flow',
          body: 'Users authenticate via the Next.js frontend at /login or /sign-up. WorkOS delivers verified session credentials which are encrypted into secure HTTP-only cookies (wos-session). User profiles are synced into PostgreSQL and linked to workspace organizations.',
        },
        {
          id: 'api-key-auth',
          heading: 'Agent API Key Authentication',
          body: 'Agent clients authorize against /mcp using standard HTTP Bearer tokens: Authorization: Bearer mm_live_<hash>. The server extracts the token, computes SHA256(token), checks the in-memory authorization cache (5-minute TTL), and queries api_keys on cache miss with sub-5ms total latency.',
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
    description: 'REST API endpoints for dashboard management, key provisioning, buckets, and playground testing.',
    readTime: '4 min read',
    content: {
      lead: 'The Next.js backend exposes structured REST endpoints for managing memories, API keys, knowledge graph nodes, and Playground RAG queries.',
      sections: [
        {
          id: 'endpoints-table',
          heading: 'Core Endpoints Catalog',
          table: {
            headers: ['HTTP Method', 'Endpoint', 'Description'],
            rows: [
              ['GET, POST', '/api/dashboard/memories', 'List recent memories or manually store a new memory.'],
              ['GET, POST, DELETE', '/api/dashboard/keys', 'List active API keys, generate a new live key, or revoke a key.'],
              ['GET, POST', '/api/dashboard/buckets', 'Retrieve workspace buckets or create a new isolated memory bucket.'],
              ['GET', '/api/dashboard/graph', 'Fetch nodes and edges for the visual interactive graph canvas.'],
              ['POST', '/api/dashboard/playground', 'Test memory retrieval and run RAG queries powered by OpenAI gpt-4o-mini.'],
              ['GET', '/api/health', 'Health check verifying database pool and service statuses.'],
            ],
          },
        },
      ],
    },
  },
};
