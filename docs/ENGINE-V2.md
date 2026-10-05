# Memron memory engine v2

This is the implementation boundary for the new engine. MCP and connector HTTP
calls use the same application service; neither transport owns retrieval or
write policy.

## Public contract

`memory_store` and `POST /v1/store` accept:

```json
{"content":"...","tags":["optional"],"importance":0.8,"space":"project:helios"}
```

`memory_recall` and `POST /v1/recall` accept:

```json
{"query":"what database does Helios use now","budget":6000,"space":"project:helios"}
```

The only required field is `content` or `query`. The response is intentionally
small: a store returns `{ok, ref, filed_as, space}` and recall returns
`{ok, answer_ready, budget_used, results[]}`. Retrieval modes, result limits,
format selectors, and signal weights are server policy, not agent policy.

## Pipeline

1. Authenticate at the edge and resolve the user/org/key scope.
2. Store: infer a memory type and namespace, encrypt content, generate the
   embedding when configured, and insert the canonical memory row.
3. Enqueue only post-write enrichment. The pointer is the idempotency key.
4. Recall: classify query complexity, generate a query embedding, run vector,
   BM25, graph, and recency signals concurrently, then fuse with adaptive RRF
   weights.
5. Hydrate encrypted source rows, apply namespace isolation, pack up to the
   inferred/overridden token ceiling, and abstain when the top result does not
   clear the confidence floor.

## Cloudflare/Railway split

- Cloudflare Worker: authentication, v2 MCP/HTTPS front door, Hyperdrive
  Postgres access, and Cloudflare Queue publication/consumption.
- Railway: the compatible Node front door and Postgres-backed queue consumer
  for deployments that do not bind Cloudflare Queues.
- Postgres/pgvector: canonical encrypted memory, vector index, graph tables,
  OAuth state, and audit data. D1/Vectorize are not introduced into the hot
  path because they would split the vector/graph join and weaken read-after-
  write behavior.

Cloudflare Queue delivery is at-least-once. The queue consumer therefore only
performs idempotent graph/entity enrichment; the durable memory row and its
embedding are committed before the caller receives success. A provider outage
can leave a row temporarily keyword/graph searchable, but it cannot silently
lose the memory. `memories.index_status` records pending/queued/indexed/failed;
operator-visible backlog metrics are the next hardening step.

## Research choices

AriGraph informs the episodic/semantic split and entity-relation world model,
but does not replace hybrid retrieval: vector search finds paraphrases, BM25
protects exact names, graph expansion supports multi-hop relations, and
recency handles changing facts. Claude-style hierarchical memory informs
namespace scoping (`space`) and a compact always-loaded stable layer, while
large episodic material remains on demand.

## Remaining gaps before production cutover

- Run the 22-item benchmark against the v2 wire contract, including abstention
  and immediate store→recall.
- Add a real index status/outbox reconciliation job so a queue outage is
  visible and repairable instead of inferred from queue depth.
- Bind a cache-disabled Hyperdrive configuration for auth and immediate
  store→recall reads (or disable caching on the current binding). Hyperdrive
  does not invalidate cached reads after writes, so this is required for a
  strict read-after-write guarantee.
- Replace the current best-effort in-process rate window with a shared limiter
  (Cloudflare Durable Object/KV or Railway Redis) before multi-instance load.
- Pin a single embedding model/dimension and run a migration/backfill before
  changing providers; mixed dimensions are rejected by design.
- Load-test Worker and Railway separately at 100 concurrent recall requests,
  then validate Hyperdrive origin connection limits and database p95/p99.
- Rotate the shared testing credential after validation and keep secrets in
  Worker/Railway secret stores only.
