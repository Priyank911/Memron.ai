/**
 * cleanup-test-rows.mjs — remove leaked benchmark/test rows from `memories`.
 *
 * Test suites leak rows when a run times out before afterAll cleanup.
 * Those duplicates crowd top-k and poison accuracy measurements.
 *
 * Dry-run by default (lists what WOULD be deleted). Pass --confirm to delete.
 *
 * Usage (PowerShell, from repo root):
 *   $env:MEMRON_MCP_URL='https://memron-ai.onrender.com/mcp'
 *   $env:MEMRON_API_KEY='mm_live_...'
 *   node scripts/cleanup-test-rows.mjs
 *   node scripts/cleanup-test-rows.mjs --confirm
 *
 * NOTE: this only covers the `memories` table (memory_manage → soft-delete,
 * which removes rows from every retrieval signal via is_active=false).
 * Auto-ingested `atomic_memories` rows (mem_* ids) have no API delete path;
 * the script prints reviewed SQL for those instead — run it in the Aiven
 * SQL editor yourself after inspection.
 */
const endpoint = (process.env.MEMRON_MCP_URL || 'http://localhost:4201/mcp').replace(/\/+$/, '');
const apiKey = process.env.MEMRON_API_KEY;
const CONFIRM = process.argv.includes('--confirm');
if (!apiKey) {
  console.error('Missing MEMRON_API_KEY.');
  process.exit(1);
}

// Tags + title prefixes that only test/benchmark rows carry. Real user
// memories must never match these — review the dry-run list before confirming.
const TEST_TAGS = ['probe', 'roundtrip_test', 'benchmark_v1'];
const TEST_TITLE_PREFIXES = ['benchmark:', 'probe diagnostic', 'roundtrip diagnostic'];

let sid = null;
let rid = 0;

async function rpc(method, params = {}) {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
  };
  if (sid) headers['Mcp-Session-Id'] = sid;
  const res = await fetch(endpoint, {
    method: 'POST', headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rid, method, params }),
  });
  const msid = res.headers.get('mcp-session-id');
  if (msid) sid = msid;
  const text = await res.text();
  const line = text.split('\n').find((l) => l.startsWith('data: '));
  return JSON.parse(line ? line.slice(6) : text);
}

async function tool(name, args) {
  const json = await rpc('tools/call', { name, arguments: args });
  if (json.error) throw new Error(JSON.stringify(json.error));
  return JSON.parse(json.result?.content?.[0]?.text ?? '{}');
}

await rpc('initialize', {
  protocolVersion: '2025-03-26', capabilities: {},
  clientInfo: { name: 'cleanup-test-rows', version: '1.0' },
});

const found = new Map(); // pointerId -> { title, tags }
for (const tag of TEST_TAGS) {
  try {
    const res = await tool('memory_search', { tags: [tag], limit: 50 });
    for (const r of res.results || []) {
      found.set(r.pointerId, { title: r.title, tags: (r.tags || []).join(','), bucket: r.bucket });
    }
  } catch (e) {
    console.warn(`tag search failed for '${tag}': ${String(e).slice(0, 120)}`);
  }
}

console.log(`\nCandidate test rows in memories: ${found.size}`);
for (const [pid, m] of found) {
  console.log(`  ${pid}  ${JSON.stringify((m.title || '').slice(0, 70))}  [${m.tags}]`);
}

if (found.size === 0) {
  console.log('Nothing to clean. Done.');
  process.exit(0);
}

if (!CONFIRM) {
  console.log('\nDRY RUN — nothing deleted. Re-run with --confirm to soft-delete these rows.');
  process.exit(0);
}

let deleted = 0;
for (const pid of found.keys()) {
  try {
    await tool('memory_manage', { action: 'delete', pointerId: pid });
    deleted++;
  } catch (e) {
    console.warn(`  delete failed for ${pid}: ${String(e).slice(0, 120)}`);
  }
}
console.log(`\nDeleted ${deleted}/${found.size} rows (soft-delete: is_active=false, excluded from all signals).`);

console.log(`
--- atomic_memories (mem_*) cannot be deleted via API. ---
If probe-scores showed mem_* polluters, expire them with reviewed SQL
in the Aiven editor AFTER inspecting what matches, e.g.:

  -- inspect first:
  SELECT memory_id, memory_type, LEFT(content, 120), created_at
  FROM atomic_memories
  WHERE user_id = 1 AND valid_to IS NULL
  ORDER BY created_at DESC LIMIT 30;

  -- expire only the rows you have reviewed (example predicate — edit it):
  -- UPDATE atomic_memories SET valid_to = NOW()
  -- WHERE user_id = 1 AND valid_to IS NULL AND memory_id IN ('mem_...');

Note: current server build already excludes valid_to IS NOT NULL rows
from the atomic BM25 signal, so expiry takes effect immediately.
`);
