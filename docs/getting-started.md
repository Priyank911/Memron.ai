# Getting Started with Memron AI

## Prerequisites
- Node.js >= 20.0
- pnpm >= 9.0 (`corepack enable`)
- Docker & Docker Compose (for local infra)

## Quick Start

```bash
# 1. Clone & install
git clone https://github.com/memron-ai/memron.git
cd memron
pnpm install

# 2. Start infrastructure
docker compose -f infra/docker/docker-compose.yml up -d

# 3. Copy environment config
cp .env.example .env

# 4. Build all packages
pnpm build

# 5. Start development
pnpm dev
```

## Project Structure

```
memron-ai/
├── apps/
│   ├── landing/          Next.js marketing site
│   └── platform/         React dashboard
├── packages/
│   ├── shared-types/     Canonical TypeScript types
│   ├── mcp-bridge/       Universal MCP Bridge + Pointer Engine
│   ├── memory-core/      Orchestration (classify → encrypt → store → pointer)
│   ├── trust-registry/   Trust score client
│   └── ui/               Shared React design system
├── services/
│   ├── memory-tunnel-api/ Hono API + MCP endpoint
│   ├── gateway/           API gateway + WebSocket hub
│   └── workers/           Background jobs (forensic, trust, rot)
├── contracts/             Solidity smart contracts (TrustRegistry)
├── tools/
│   └── cli/               Memron CLI
├── infra/
│   ├── docker/            Docker Compose + Dockerfiles
│   ├── k8s/               Kubernetes manifests
│   └── terraform/         Infrastructure as Code
└── docs/                  Architecture & protocol docs
```

## Key Concepts

### Memory Tunnel
Agents don't send raw context. They exchange **pointers** — tiny references
to encrypted, stored memory records. This achieves 89-95% token compression.

### Bucketed Memory
Memories are automatically classified into thematic buckets (conversation,
tool-results, preferences, knowledge) for organized retrieval.

### Context Injection
Instead of replaying entire histories, Memron injects only the exact
relevant context slices into the active inference window.

### Security
- AES-256-GCM encryption for memory records
- Time-bounded access grants with RFC3339 expiration
- Forensic snapshots for poisoning detection and rollback
- Trust Registry for agent reputation scoring
