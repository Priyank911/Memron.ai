<div align="center">

![Memron](./apps/landing/public/logo_w.png)

# Memron

**Persistent memory for AI agents. Retain context across conversations, learn from every interaction, and transform stateless systems into context-aware applications that truly remember.**

[![License: BUSL-1.1](https://img.shields.io/badge/License-BUSL--1.1-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6)](https://www.typescriptlang.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-Compatible-00A3FF)](https://modelcontextprotocol.io)

[Website](https://memron.ai) · [Documentation](docs/ARCHITECTURE.md) · [Getting Started](#installation)

</div>

---

A production-grade memory infrastructure for AI agents built on the Model Context Protocol (MCP). Memron enables persistent, portable, and private memory that works across platforms, providers, and sessions through hardware-backed zero-trust architecture and pointer-based context compression.

**Key Innovation**: Pointer-based context transfer achieving 89-95% token compression. Instead of sending entire conversation histories, Memron uses smart pointers to relevant memories, reducing inference costs by 10-100x while delivering surgical context injection.

---

## Table of Contents

- [System Overview](#system-overview)
- [Architecture](#architecture)
- [Memory Pipeline](#memory-pipeline)
- [Technology Stack](#technology-stack)
- [Installation](#installation)
- [Configuration](#configuration)
- [MCP Integration](#mcp-integration)
- [API Documentation](#api-documentation)
- [Storage Options](#storage-options)
- [Monorepo Structure](#monorepo-structure)
- [Contributing](#contributing)

---

## System Overview

Memron solves the context amnesia problem in AI systems through a distributed memory backbone. Traditional AI agents suffer from memory loss between sessions, context locked in silos, and no user ownership of conversation data. This results in degraded output quality, massive token waste, and zero portability between platforms.

The system implements a bucketed memory architecture that organizes context into thematic partitions (Conversation, Tools, Preferences, Knowledge), each with cryptographic integrity verification and hardware-backed access control. Memory operations flow through a multi-stage pipeline ensuring input validation, canonical normalization, intelligent routing, and distributed persistence with forensic audit capabilities.

**Core Capabilities**:
- Cross-platform memory transfer via MCP protocol standard
- Threshold encryption with Lit Protocol (only authorized DIDs can decrypt)
- IPFS content-addressed storage with immutable CID verification
- Forensic snapshots for poisoning detection and state rollback
- 89-95% token compression through pointer-based retrieval
- Identity-based access control with RFC3339 timestamp expiration

This architecture enables AI agents to maintain persistent context across sessions, platforms, and providers while ensuring user sovereignty over memory ownership and privacy. The system is designed for production environments with comprehensive observability, error handling, and scalability.

---

## Architecture

The system implements a layered architecture separating concerns across MCP client interface, memory processing pipeline, and distributed storage backends. Each layer exposes health check endpoints and structured metadata for comprehensive observability and debugging.

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP CLIENT (Agents)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │    Cursor    │  │    Claude    │  │   Windsurf   │       │
│  │  Desktop App │  │  Desktop App │  │  Desktop App │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
                            ↓ MCP Protocol (JSON-RPC)
┌─────────────────────────────────────────────────────────────┐
│                 MEMRON MCP SERVER (Node.js)                 │
│                                                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │           TOOL ROUTING & ORCHESTRATION                 │ │
│  │    Tool Registry → Permission Checks → Dispatch        │ │
│  └────────────────────────────────────────────────────────┘ │
│                            ↓                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              PERCEPTION LAYER (Observable)             │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐              │ │
│  │  │  Memory  │  │  Query   │  │  Access  │              │ │
│  │  │  Write   │  │  Parse   │  │  Verify  │              │ │
│  │  └──────────┘  └──────────┘  └──────────┘              │ │
│  └────────────────────────────────────────────────────────┘ │
│                            ↓                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │           NORMALIZATION LAYER (Observable)             │ │
│  │    Bucketing → Deduplication → Embedding Generation    │ │
│  └────────────────────────────────────────────────────────┘ │
│                            ↓                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │          MEMORY MANAGEMENT LAYER - Four Buckets        │ │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐        │ │
│  │  │Conversation│  │   Tools    │  │Preferences │        │ │
│  │  └────────────┘  └──────────────┘  └────────────┘        │ │
│  │                   ┌────────────┐                        │ │
│  │                   │ Knowledge  │                        │ │
│  │                   └────────────┘                        │ │
│  │  Semantic Search · Vector Similarity · Temporal Decay   │ │
│  └────────────────────────────────────────────────────────┘ │
│                            ↓                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              PERSISTENCE LAYER (Observable)            │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐              │ │
│  │  │  Local   │  │   IPFS   │  │    Lit   │              │ │
│  │  │  SQLite  │  │  Pinning │  │ Protocol │              │ │
│  │  └──────────┘  └──────────┘  └──────────┘              │ │
│  │  Forensic Snapshots · Encryption · CID Verification    │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

The MCP client layer interfaces with AI agents through the standardized Model Context Protocol, exposing memory operations as tools that agents can invoke directly. The server layer orchestrates the full memory pipeline with independent processing stages for input validation, context normalization, intelligent bucketing, and distributed persistence with cryptographic integrity checks.

---

## Memory Pipeline

The memory pipeline implements a four-stage processing workflow that transforms raw agent interactions into structured, retrievable memory artifacts. Each stage executes independently with comprehensive error handling and observability.

### Stage 1: Perception

The perception stage validates incoming memory writes and queries, ensuring well-formed inputs before processing. This stage implements input sanitization to prevent injection attacks, permission verification through DID-based access control, rate limiting to prevent abuse, and content classification to determine appropriate bucket routing. Outputs include validated memory objects with normalized timestamps, extracted metadata tags, and preliminary confidence scores.

### Stage 2: Normalization

Once perception validates the input, normalization transforms heterogeneous memory formats into a canonical representation. This stage performs bucket classification into one of four thematic categories (Conversation, Tools, Preferences, Knowledge), embedding generation through OpenAI's text-embedding-3-small model for semantic search, deduplication detection through vector similarity comparison to prevent redundant storage, and content chunking for memories exceeding single-chunk limits. The normalized memory includes 1536-dimensional semantic embeddings, bucket assignments, conflict resolution metadata, and dedupe fingerprints.

### Stage 3: Memory Management

The memory management stage handles intelligent retrieval and injection of relevant context based on agent queries. This stage employs semantic search across vector embeddings with cosine similarity scoring, temporal decay functions to prioritize recent memories while maintaining access to historical context, cross-bucket fusion to build comprehensive context from multiple memory categories, and relevance ranking with configurable thresholds. Retrieval queries return ranked memory pointers with relevance scores between 0-1, temporal decay factors, original content or summaries, metadata including tags and sources, and CID references for verification.

### Stage 4: Persistence

The final persistence stage commits memories to distributed storage with cryptographic integrity guarantees. This stage executes forensic snapshots before mutations to enable rollback and poisoning detection, IPFS pinning with CID verification ensuring content addressing integrity, Lit Protocol encryption with threshold decryption requiring authorized DIDs, and local SQLite caching for rapid sub-millisecond access. Each memory write produces an immutable CID pointing to IPFS storage, encrypted payload reference with access control metadata, snapshot CID for pre-mutation state, and cache entry for performance optimization.

Each pipeline stage exposes health check endpoints through the `/health` API and emits structured logs with execution metrics for monitoring dashboards. The sequential execution ensures data integrity while the observable design enables granular debugging and performance optimization in production environments.

---

## Technology Stack

The system employs modern, production-grade technologies selected for performance, decentralization, security, and developer experience. The technology choices reflect requirements for distributed storage, cryptographic security, and standards-based integration.

### MCP Server Technologies

The MCP server runs on Node.js 20+ providing access to the latest language features and performance improvements. TypeScript 5.6 ensures type safety with strict mode enforcement and modern decorators support. The MCP SDK implements the Model Context Protocol specification version 2024-11-05, exposing memory operations as standardized tools accessible to any MCP-compatible AI agent. sqlite3 with better-sqlite3 bindings provides local persistence with WAL mode for concurrent access and full-text search capabilities.

### Storage & Encryption

IPFS through js-ipfs (Helia) provides content-addressed storage with immutable CIDs, supporting both embedded IPFS nodes and remote gateway access for flexible deployment. Lit Protocol implements threshold encryption with distributed key management across a decentralized network, ensuring only authorized DIDs with valid access grants can decrypt memories. Local SQLite instances serve as performance-optimized cache layers with LRU eviction policies and JSON support for flexible schema evolution. The storage architecture supports hybrid deployments combining local caching, IPFS distribution, and optional Arweave archival for permanence.

### Vector & Semantic Search

OpenAI's text-embedding-3-small model generates 1536-dimensional embeddings optimized for semantic similarity at reduced cost compared to larger embedding models. The system implements cosine similarity search with configurable threshold filtering and optional FAISS acceleration for memory sets exceeding 10,000 entries. Temporal decay functions incorporate recency bias using exponential decay with configurable half-life parameters, ensuring fresh memories receive priority while maintaining access to historical context.

### Frontend Technologies

The landing page leverages Next.js 15 with App Router for optimal performance through automatic code splitting, React Server Components, and static generation. Tailwind CSS 4.0 provides utility-first styling with custom design tokens, responsive breakpoints, and dark mode support. The dashboard application uses React 18 with concurrent features, Suspense boundaries for progressive loading, and optimistic UI updates for perceived performance.

---

## Installation

The installation process requires setting up the MCP server, configuring storage backends, and optionally deploying frontend applications. The system supports multiple deployment modes from local development to production cloud environments.

### Prerequisites

Before installation, ensure you have Node.js 20 or later installed along with pnpm 9.15+ for workspace management. Obtain API credentials from OpenAI for embedding generation (platform.openai.com), and optionally from Lit Protocol for hardware-backed encryption (developer.litprotocol.com). For IPFS storage, either run a local IPFS daemon or obtain access to a remote gateway.

### Monorepo Installation

Clone the repository and install all workspace dependencies:

```bash
git clone https://github.com/memron-ai/memron.git
cd memron
pnpm install
```

Build all packages in dependency order using Turbo:

```bash
pnpm build
```

The build process compiles TypeScript packages, generates type definitions, and prepares distribution bundles for all workspace packages.

### MCP Server Setup

Navigate to the MCP server package and configure environment variables:

```bash
cd packages/mcp-server
cp .env.example .env
```

Edit the `.env` file with your configuration:

```bash
# Storage Configuration
STORAGE_TYPE=local              # local | ipfs | hybrid
SQLITE_PATH=./data/memron.db    # Local database path

# OpenAI Configuration (Required)
OPENAI_API_KEY=sk-...           # API key for embeddings

# IPFS Configuration (Optional)
IPFS_GATEWAY=https://ipfs.io
IPFS_API_URL=http://localhost:5001

# Lit Protocol Configuration (Optional)
LIT_NETWORK=cayenne             # cayenne | manzano | habanero
LIT_CHAIN=ethereum              # ethereum | polygon

# Server Configuration
MCP_LOG_LEVEL=info              # debug | info | warn | error
```

Start the MCP server in development mode:

```bash
pnpm dev
```

The server initializes the MCP protocol, logs available tools and health check results, and begins listening for agent connections.

---

## Configuration

Configuration is managed through environment variables for security and deployment flexibility. Advanced scenarios support JSON configuration files for complex memory routing rules and access policies.

### Storage Backend Configuration

The `STORAGE_TYPE` variable determines the persistence strategy. Setting it to `local` uses SQLite only, providing rapid development iteration and single-user deployments with no external dependencies. Setting it to `ipfs` enables distributed storage with IPFS pinning, CID verification, and optional Filecoin or Arweave archival. Setting it to `hybrid` combines local SQLite caching with IPFS persistence, optimizing for both performance through local reads and decentralization through IPFS distribution.

### Encryption Configuration

Lit Protocol encryption is enabled by providing `LIT_NETWORK` and `LIT_CHAIN` environment variables. When enabled, all memories undergo threshold encryption before storage, requiring authorized DIDs for decryption. The system supports granular access control with time-limited grants specified in RFC3339 format, allowing temporary access delegation that automatically expires. Access policies can be configured per memory bucket, enabling different security models for conversation history versus sensitive preferences.

### Embedding Model Configuration

The default embedding model is OpenAI's text-embedding-3-small generating 1536-dimensional vectors. Alternative models can be configured through the server configuration file, including local embedding models for air-gapped environments or specialized domain embedding models for improved semantic search in technical domains. The system supports embedding dimension adaptation through PCA projection for compatibility across different model dimensions.

---

## MCP Integration

Memron exposes memory operations through standardized MCP tools that AI agents can invoke directly without client-side integration code. Integration requires adding Memron to the MCP client configuration file.

### Claude Desktop Integration

Edit the Claude Desktop configuration located at `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS or `%APPDATA%\Claude\claude_desktop_config.json` on Windows:

```json
{
  "mcpServers": {
    "memron": {
      "command": "node",
      "args": ["/absolute/path/to/memron/packages/mcp-server/dist/index.js"],
      "env": {
        "OPENAI_API_KEY": "sk-...",
        "STORAGE_TYPE": "local",
        "SQLITE_PATH": "/absolute/path/to/memron.db"
      }
    }
  }
}
```

Restart Claude Desktop to activate the integration. Memron tools will appear in the tool selection panel, allowing Claude to read and write memories during conversations.

### Available MCP Tools

The MCP server exposes five primary tools following the Model Context Protocol specification:

**memron_write**: Write a new memory to a specific bucket with optional metadata, tags, and access control grants. Accepts content string, bucket name, metadata object, and optional expiration timestamp.

**memron_query**: Retrieve relevant memories using semantic search across specified buckets. Accepts query string, bucket array, result limit, and minimum relevance score threshold.

**memron_list_buckets**: List all available memory buckets with statistics including entry counts, total storage size, and last update timestamps.

**memron_snapshot** Create a forensic snapshot of current memory state for rollback capability. Returns snapshot CID and timestamp.

**memron_rollback**: Rollback memory state to a previous snapshot identified by CID. Validates snapshot integrity before restoration.

Each tool returns structured JSON responses with success status, data payload, and comprehensive error details including error codes and troubleshooting suggestions.

---

## API Documentation

The MCP server implements the Model Context Protocol specification with memory-specific tool definitions and error handling. All API responses follow consistent JSON structures for interoperability.

### Memory Write API

The `memron_write` tool accepts a memory object with required content and bucket fields:

```json
{
  "content": "User prefers TypeScript over JavaScript for type safety and tooling",
  "bucket": "preferences",
  "metadata": {
    "source": "conversation",
    "confidence": 0.95,
    "tags": ["language", "typescript", "coding-style"]
  },
  "access": {
    "readers": ["did:key:z6Mk..."],
    "expiresAt": "2027-02-13T23:59:59Z"
  }
}
```

Response includes the assigned memory ID (UUID v4), generated CID for IPFS storage verification, embedding vector summary with dimension and norm information, snapshot CID capturing pre-mutation state, and success boolean with optional error details.

### Memory Query API

The `memron_query` tool performs semantic search across specified memory buckets:

```json
{
  "query": "What are the user's coding preferences and style guidelines?",
  "buckets": ["preferences", "tools", "conversation"],
  "limit": 10,
  "minScore": 0.7,
  "includeMetadata": true
}
```

Response returns an array of ranked memories sorted by combined relevance and temporal scores. Each result includes the relevance score (0-1) from cosine similarity, temporal decay factor based on memory age, original content string or summary for large memories, metadata object with tags and source information, CID reference for content verification, and creation timestamp in ISO 8601 format.

### Health Check Endpoints

The server exposes health monitoring endpoints for operational visibility:

```
GET /health → Overall system health with status and component checks
GET /health/storage → Storage backend connectivity and capacity
GET /health/embeddings → Embedding service status and model info
GET /health/encryption → Lit Protocol connectivity and key status
```

Health responses include status enum (operational | degraded | offline), component-specific metrics, recent error counts, and timestamp of last successful operation.

---

## Storage Options

Memron provides flexible storage backends optimized for different deployment scenarios, privacy requirements, and performance characteristics.

### Local Storage

The local storage backend uses SQLite with Write-Ahead Logging (WAL) mode for concurrent access and improved write performance. Ideal for development environments, testing scenarios, and single-user deployments requiring rapid iteration. Memories persist in a single database file with automatic checkpointing, full-text search indexes, and JSON column support for flexible schema evolution. No external dependencies or network access required. Backup strategy involves simple file-level replication or continuous archival.

### IPFS Storage

The IPFS backend provides content-addressed storage with immutable CID verification and distributed availability across the IPFS network. Memories are pinned to specified IPFS nodes or pinning services like Pinata, Web3.Storage, or NFT.Storage for persistence guarantees. CID verification ensures content integrity through cryptographic hashing. Supports both embedded IPFS nodes running in-process and remote IPFS gateways for reduced resource consumption. Optional Arweave integration enables permanent archival with endowment-based storage fees.

### Hybrid Storage

The hybrid backend combines local SQLite caching with IPFS persistence, optimizing for both performance and decentralization. Frequently accessed memories populate the local cache for sub-millisecond retrieval while all memories persist to IPFS for distribution and availability. Cache eviction uses LRU (Least Recently Used) policy with configurable size limits from 100MB to 10GB. Cache misses trigger IPFS fetch with automatic cache population. Write operations commit to both local cache and IPFS concurrently with configurable consistency models (eventual | strong).

---

## Monorepo Structure

The project uses a pnpm workspace monorepo with Turbo for incremental builds and caching. This structure enables code sharing, unified dependency management, and optimized build performance.

```
memron/
├── apps/
│   ├── landing/              # Next.js landing page
│   └── platform/             # React dashboard (coming soon)
├── packages/
│   ├── mcp-server/           # MCP server implementation
│   ├── shared-types/         # TypeScript type definitions
│   ├── memory-core/          # Core memory orchestration
│   ├── lit-encryption/       # Lit Protocol integration
│   └── ipfs-persistence/     # IPFS storage layer
├── docs/                     # Architecture documentation
├── package.json              # Root workspace configuration
├── pnpm-workspace.yaml       # Workspace package definitions
└── turbo.json                # Turbo build pipeline config
```

Each package exposes a clean API through TypeScript exports, enabling modular consumption and independent testing. The `shared-types` package provides canonical type definitions used across all packages, ensuring type consistency. Build outputs are cached by Turbo based on input file hashes, dramatically reducing rebuild times during development.

---

## Contributing

Memron is open source under the Business Source License  1.1 (BUSL-1.1), automatically converting to Apache 2.0 four years after publication. We welcome contributions from the community including bug fixes, feature implementations, documentation improvements, and testing enhancements.

### Development Setup

Fork the repository on GitHub and clone your fork locally. Install all workspace dependencies with `pnpm install` and build packages with `pnpm build`. Run the test suite with `pnpm test` to verify correct setup. The development workflow uses Turbo for fast incremental builds and hot module replacement during active development.

### Contribution Guidelines

Submit pull requests to the `main` branch with clear descriptions of changes, motivations, and any breaking changes. Include tests for new features and bug fixes, ensuring coverage metrics remain above 80% for core packages. Follow existing TypeScript conventions enforced by ESLint and Prettier, running `pnpm lint` and `pnpm format` before committing. Update documentation for user-facing changes including tool APIs, configuration options, and deployment guides.

### Reporting Issues

Report bugs through GitHub Issues using the provided templates for bug reports, feature requests, and documentation issues. Include minimal reproduction cases with steps to reproduce, expected versus actual behavior, system information (OS, Node version, package versions), and relevant error logs or stack traces. For security vulnerabilities, email security@memron.ai directly with encrypted messages to our PGP key rather than filing public issues.

---

## License

This project is licensed under the **Business Source License 1.1 (BUSL-1.1)**. The licensed work automatically converts to Apache License 2.0 four years after each version's publication date. See [LICENSE](LICENSE) for complete details.

**Additional Use Grant**: You may use the licensed work for production purposes in non-commercial open source projects and during development/testing for commercial projects without waiting for the conversion date. Commercial production use requires a commercial license agreement.

---

<div align="center">

**Building the memory layer for the Internet of Agents**

[Website](https://memron.ai) · [Documentation](docs/) · [GitHub](https://github.com/memron-ai/memron) · [Discord](#) · [Twitter](#)

</div>
