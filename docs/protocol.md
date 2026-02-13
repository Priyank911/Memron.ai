# Memron AI — Memory Tunnel Protocol Specification

## Overview

The Memory Tunnel is the core transport mechanism that enables sovereign,
cross-platform memory transfer between AI agents using the Model Context
Protocol (MCP).

## Pointer System

### Design Rationale
Instead of transferring raw conversation context (thousands of tokens),
agents exchange **pointers** — short identifiers (8-12 chars) that reference
encrypted, IPFS-anchored memory records.

### Compression Metrics
| Metric                  | Target      |
|------------------------|-------------|
| Token compression rate | 89–95%      |
| Pointer ID length      | 12 chars    |
| Pointer token cost     | ~3 tokens   |
| Typical context saved  | 500-10K tokens per pointer |

### Pointer Format
```
ptr_[a-zA-Z0-9]{8}
```
Example: `ptr_kN7xQ2mP`

## Memory Buckets

| Bucket         | Description                              | Priority |
|---------------|------------------------------------------|----------|
| conversation  | Dialogue history and turns               | 1        |
| tool-results  | Outputs from tool executions             | 2        |
| preferences   | User settings and behavioral patterns    | 3        |
| knowledge     | Facts, docs, learned information         | 2        |
| system        | System prompts and configuration         | 0        |
| custom        | User-defined custom buckets              | varies   |

## Access Control

### Grant Structure
- **Granter DID**: The entity issuing the permission
- **Grantee DID**: The entity receiving the permission
- **Permission**: `read` | `write` | `admin`
- **Scope**: Global, per-bucket, or per-CID
- **Expiration**: RFC3339 timestamp (mandatory)

### Security Layers
1. **Lit Protocol Encryption**: Identity-based threshold decryption
2. **Access Grants**: Time-bounded, granular R/W control
3. **Forensic Snapshots**: Pre-mutation snapshots for poisoning rollback
4. **Trust Registry**: On-chain reputation for collaborative scoring

## MCP Tools

| Tool               | Description                                    |
|-------------------|------------------------------------------------|
| `memron_store`    | Store content → encrypt → IPFS → return pointer |
| `memron_recall`   | Resolve pointer → decrypt → return context      |
| `memron_search`   | Semantic search across memory buckets           |
| `memron_drop`     | P2P share a pointer with another agent          |
| `memron_snapshot` | Create forensic snapshot for rollback           |
