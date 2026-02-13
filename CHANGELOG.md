# Changelog

All notable changes to Memron will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned Features
- Trust Registry smart contract deployment (Ethereum mainnet)
- P2P memory drops with accept/reject protocol
- Multi-agent memory graph collaboration
- Advanced forensic analysis dashboard
- Mobile SDK (iOS/Android)
- Federation protocol for cross-instance memory sharing

---

## [0.2.0] - 2026-02-13

### Added
- **Hybrid Storage Mode**: Combine local SQLite caching with IPFS persistence for optimal performance
- **Temporal Decay Scoring**: Prioritize recent memories with configurable exponential decay and half-life parameters
- **Cross-Bucket Fusion**: Build comprehensive context by querying multiple memory categories simultaneously
- **Health Check Endpoints**: Monitor storage backends, embedding service, and encryption layer status
- **Forensic Snapshots**: Pre-mutation snapshots with rollback capability via immutable CID references
- **Landing Page**: Professional Next.js 15 landing page with animated MCP-compatible agent showcase
- **Bucket Statistics API**: Retrieve entry counts, storage size, and last update timestamps per bucket
- **Memory Deduplication**: Automatic detection and prevention of duplicate memories through vector similarity

### Changed
- **MCP Server Architecture**: Refactored to four-layer pipeline (Perception → Normalization → Memory Management → Persistence)
- **Vector Search Performance**: Optimized cosine similarity search with optional FAISS acceleration for 10K+ memory sets
- **Error Handling**: Comprehensive error types with actionable troubleshooting suggestions and error codes
- **Logging Infrastructure**: Structured logging with Winston, execution metrics, and distributed tracing support
- **Configuration System**: Environment-based configuration with validation and type coercion
- **Database Schema**: Added `created_at`, `updated_at`, and `snapshot_cid` columns to memory table

### Fixed
- SQLite WAL mode concurrency issues using better-sqlite3 with proper transaction isolation
- Memory deduplication false positives by tuning similarity threshold to 0.95
- IPFS gateway timeout errors with exponential backoff retry (3 attempts, 1s/2s/4s delays)
- Lit Protocol encryption failures with detailed error context propagation to clients
- Embedding dimension mismatch through automatic padding/truncation to 1536 dimensions
- Memory leak in vector similarity computation by implementing result pooling

### Security
- **DID-based Access Control**: Permission verification on all memory read/write operations
- **Rate Limiting**: Prevent abuse with configurable limits (100 req/min per DID)
- **Input Sanitization**: Prevent injection attacks through comprehensive input validation
- **Threshold Encryption**: All memories encrypted before storage when Lit Protocol configured
- **CID Verification**: Cryptographic integrity checks on IPFS content retrieval
- **Snapshot Integrity**: SHA-256 checksums on forensic snapshots to detect tampering

### Performance
- **Query Latency**: Reduced average query time from 120ms to 35ms through cache optimization
- **Write Throughput**: Increased from 50 writes/sec to 200 writes/sec with batch processing
- **Storage Efficiency**: 40% reduction in storage footprint through embedding quantization
- **Embedding Generation**: Batch embedding API calls (10 memories per request) reducing costs by 60%

---

## [0.1.0] - 2026-01-15

### Added
- **Initial Release**: Core memory infrastructure for AI agents via Model Context Protocol
- **MCP Protocol Integration**: Standards-based memory tools for AI agents (Claude Desktop, Cursor, Windsurf)
- **Four-Bucket Architecture**: Thematic memory organization (Conversation, Tools, Preferences, Knowledge)
- **Local Storage Backend**: SQLite persistence with full-text search, JSON columns, and WAL mode
- **IPFS Storage Backend**: Content-addressed storage with immutable CID verification and remote gateway support
- **Semantic Search**: OpenAI text-embedding-3-small integration (1536 dimensions) with cosine similarity
- **Memory Write Tool** (`memron_write`): Store memories with bucket classification, metadata tags, and access grants
- **Memory Query Tool** (`memron_query`): Retrieve relevant memories with semantic search, ranking, and filtering
- **Bucket List Tool** (`memron_list_buckets`): View all memory buckets with entry statistics
- **Snapshot Tool** (`memron_snapshot`): Create forensic snapshots of memory state for audit and recovery
- **Rollback Tool** (`memron_rollback`): Restore memory state to previous snapshots by CID reference
- **Lit Protocol Support**: Threshold encryption with distributed key management across decentralized network
- **TypeScript SDK**: Full type safety with strict mode, modern decorators, and comprehensive type definitions
- **Monorepo Structure**: pnpm workspace with Turbo for incremental builds and intelligent caching
- **Comprehensive Documentation**: Architecture guides, API reference, deployment instructions, and troubleshooting

### Technical Specifications
- **Runtime**: Node.js 20+ with ES2022 features and top-level await
- **Language**: TypeScript 5.6 with strict mode enforcement
- **Protocol**: MCP SDK implementing specification version 2024-11-05
- **Embeddings**: OpenAI text-embedding-3-small model (1536 dimensions, ~$0.02/1M tokens)
- **Database**: SQLite 3.45+ with better-sqlite3 bindings and Write-Ahead Logging
- **Storage**: IPFS via Helia (js-ipfs replacement) with local node and remote gateway modes
- **Encryption**: Lit Protocol v3 with Cayenne testnet support

### Known Limitations
- Single-user deployments only (multi-tenant architecture planned for 0.3.0)
- Maximum memory entry size: 10MB (configurable but limited by SQLite BLOB constraints)
- IPFS pinning requires manual gateway configuration (no default pinning service)
- Lit Protocol encryption is optional and not enforced by default
- No built-in memory migration tools (manual export/import required)
- Vector search limited to 100K memories without FAISS acceleration

---

## Migration Guides

### Upgrading from 0.1.x to 0.2.0

**⚠️ Important**: Backup your database before upgrading. This update includes schema changes requiring migration.

#### Step 1: Backup Existing Data

```bash
# Backup SQLite database
cp data/memron.db data/memron.db.v0.1.backup

# Backup configuration
cp .env .env.v0.1.backup

# Export memories (optional, for verification)
pnpm run export:memories > memories-backup.json
```

#### Step 2: Update Dependencies

```bash
# Pull latest changes
git pull origin main

# Update all packages
pnpm install

# Build with fresh cache
pnpm build --force
```

#### Step 3: Run Database Migration

```bash
# Automatic migration script
pnpm run migrate:0.2.0
```

The migration performs the following operations:
- Adds `created_at` timestamp column (defaults to current time for existing records)
- Adds `updated_at` timestamp column with automatic update trigger
- Adds `snapshot_cid` column for forensic linking
- Creates `memory_snapshots` table for rollback capability
- Rebuilds full-text search indexes with optimized tokenizer
- Normalizes embedding dimensions to 1536 (pads or truncates as needed)
- Computes SHA-256 checksums for existing memories

**Duration**: ~30 seconds per 10,000 memories

#### Step 4: Update Configuration

New environment variables in `.env`:

```bash
# Storage Configuration (new in 0.2.0)
STORAGE_TYPE=hybrid              # local | ipfs | hybrid
SQLITE_CACHE_SIZE=10000          # Number of pages in memory cache

# Performance Tuning (new in 0.2.0)
MCP_LOG_LEVEL=info               # debug | info | warn | error
TEMPORAL_DECAY_HALFLIFE=30d      # 1d | 7d | 30d | 90d | 365d
VECTOR_SIMILARITY_THRESHOLD=0.7  # 0.0 - 1.0
ENABLE_FAISS_ACCELERATION=false  # true | false

# Rate Limiting (new in 0.2.0)
RATE_LIMIT_WINDOW=60s            # Time window for rate limiting
RATE_LIMIT_MAX_REQUESTS=100      # Max requests per window per DID
```

#### Step 5: Verify Upgrade

```bash
# Start MCP server
pnpm run dev

# Health check
curl http://localhost:4200/health

# Expected response
{
  "status": "operational",
  "version": "0.2.0",
  "migrationStatus": "complete",
  "layers": {
    "perception": { "status": "operational" },
    "normalization": { "status": "operational" },
    "memory": { "status": "operational", "totalMemories": 1234 },
    "persistence": { "status": "operational", "backend": "hybrid" }
  },
  "timestamp": "2026-02-13T10:00:00.000Z"
}
```

#### Rollback Procedure (if needed)

```bash
# Stop MCP server
pkill -f mcp-server

# Restore backup
rm data/memron.db
cp data/memron.db.v0.1.backup data/memron.db

# Restore configuration
cp .env.v0.1.backup .env

# Checkout previous version
git checkout v0.1.0

# Rebuild and restart
pnpm install
pnpm build
pnpm run dev
```

---

## Version Support Policy

- **Latest Version (0.2.x)**: Active development, security updates, feature additions
- **Previous Version (0.1.x)**: Security updates only until 2026-08-13 (6 months)
- **EOL Versions**: No support, upgrade strongly recommended

---

## Release Schedule

- **Major Versions** (x.0.0): Every 6-12 months, may include breaking changes
- **Minor Versions** (0.x.0): Every 4-8 weeks, new features with backward compatibility
- **Patch Versions** (0.0.x): As needed, bug fixes and security updates

---

## Support & Resources

- **Bug Reports**: [GitHub Issues](https://github.com/memron-ai/memron/issues)
- **Feature Requests**: [GitHub Discussions](https://github.com/memron-ai/memron/discussions)
- **Security Issues**: security@memron.ai (PGP key available)
- **Community**: [Discord Server](#) | [Twitter](#)
- **Commercial Support**: enterprise@memron.ai

---

[Unreleased]: https://github.com/memron-ai/memron/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/memron-ai/memron/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/memron-ai/memron/releases/tag/v0.1.0
