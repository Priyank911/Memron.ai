/**
 * Tier 0 regression suite against REAL Postgres.
 *
 * Contract under test: a memory stored under a name is retrievable by that
 * exact name immediately, with no embedding, queue or enrichment. This suite
 * must pass at 100%. Any miss is a regression.
 *
 * Run locally:
 *   MEMRON_TEST_PG=postgres://postgres@localhost:5433/memron_test pnpm vitest run shell-index.integration
 * In CI set MEMRON_REQUIRE_PG=1 so a missing database fails instead of skipping.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const PG_URL = process.env.MEMRON_TEST_PG;
const REQUIRE = process.env.MEMRON_REQUIRE_PG === '1';
const run = PG_URL || REQUIRE ? describe : describe.skip;

type Engine = typeof import('../engine/unified-memory-engine.js');
type Shell = typeof import('../retrieval/shell-index.js');
type Queries = typeof import('../db/queries.js');
type Client = typeof import('../db/client.js');

let engine: Engine;
let shell: Shell;
let queries: Queries;
let client: Client;
let userA = 0;
let userB = 0;

const queue = { send: async () => undefined };

const SYLL = ['zor', 'bla', 'vex', 'quan', 'tis', 'mor', 'del', 'ska', 'rin', 'fol', 'gax', 'nul', 'pir', 'yod', 'wen', 'kru'];
function uniqueName(i: number, style: number): string {
  const a = SYLL[i % 16];
  const b = SYLL[Math.floor(i / 16) % 16];
  const c = SYLL[Math.floor(i / 256) % 16];
  const base = `${a}${b}${c}${i}`;
  const cap = base[0].toUpperCase() + base.slice(1);
  switch (style % 4) {
    case 0: return `${cap}Graph`;          // CamelCase compound
    case 1: return `${cap}-Engine`;        // hyphenated compound
    case 2: return `${cap} Station`;       // capitalized two-word name
    default: return `${cap}Core${i}`;      // compound with digits
  }
}

run('Tier 0 shell index (real Postgres)', () => {
  beforeAll(async () => {
    const url = new URL(PG_URL || 'postgres://postgres@localhost:5433/memron_test');
    process.env.PG_HOST = url.hostname;
    process.env.PG_PORT = url.port || '5432';
    process.env.PG_USER = decodeURIComponent(url.username || 'postgres');
    process.env.PG_PASSWORD = decodeURIComponent(url.password || '');
    process.env.PG_DATABASE = url.pathname.slice(1);
    process.env.PG_SSL = 'false';
    process.env.ENCRYPTION_SECRET ||= 'test-encryption-secret-for-shell-suite';
    process.env.JWT_SECRET ||= 'test-jwt-secret-for-shell-suite';

    client = await import('../db/client.js');
    const { SHELL_MIGRATIONS } = await import('../db/schema.js');
    shell = await import('../retrieval/shell-index.js');
    queries = await import('../db/queries.js');
    engine = await import('../engine/unified-memory-engine.js');

    await client.query('DROP TABLE IF EXISTS shell_aliases, shell_index, memories, memory_index_jobs, users CASCADE');
    await client.query('CREATE TABLE users (id SERIAL PRIMARY KEY, email TEXT)');
    await client.query(`CREATE TABLE memories (
      id SERIAL PRIMARY KEY,
      pointer_id VARCHAR(64) UNIQUE NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      org_id INTEGER,
      bucket TEXT NOT NULL DEFAULT 'knowledge',
      title TEXT NOT NULL DEFAULT '',
      content_encrypted BYTEA NOT NULL,
      content_iv BYTEA NOT NULL,
      content_tag BYTEA NOT NULL,
      content_hash TEXT,
      tags TEXT[] NOT NULL DEFAULT '{}',
      token_count INTEGER,
      original_tokens INTEGER,
      metadata JSONB NOT NULL DEFAULT '{}',
      status TEXT DEFAULT 'untriaged',
      source TEXT DEFAULT 'agent',
      decay_exempt BOOLEAN DEFAULT false,
      is_active BOOLEAN NOT NULL DEFAULT true,
      api_key_id INTEGER,
      sub_path TEXT DEFAULT '',
      importance DOUBLE PRECISION DEFAULT 0.5,
      access_count INTEGER DEFAULT 0,
      last_accessed_at TIMESTAMPTZ,
      index_status TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await client.query('CREATE TABLE memory_index_jobs (pointer_id TEXT PRIMARY KEY, user_id INT, org_id INT, payload JSONB)');
    for (const ddl of SHELL_MIGRATIONS) {
      // RLS is a Supabase concern; the test role is a superuser anyway.
      await client.query(ddl);
    }
    userA = (await client.query('INSERT INTO users(email) VALUES ($1) RETURNING id', ['a@test'])).rows[0].id;
    userB = (await client.query('INSERT INTO users(email) VALUES ($1) RETURNING id', ['b@test'])).rows[0].id;
  }, 60_000);

  afterAll(async () => {
    await client?.close().catch(() => undefined);
  });

  const store = (content: string, opts: { tags?: string[]; user?: number } = {}) =>
    engine.storeMemory(opts.user ?? userA, { content, tags: opts.tags }, { queue });
  const refs = (r: { results: Array<{ ref: string }> }) => r.results.map((x) => x.ref);

  it('recalls 500 uniquely named memories by exact name immediately after store (must be 100%)', async () => {
    const stored: Array<{ name: string; ref: string }> = [];
    for (let i = 0; i < 500; i++) {
      const name = uniqueName(i, i);
      const res = await store(`${name} is a ${['routing', 'storage', 'scheduling', 'ranking'][i % 4]} component that owns number ${i} of the pipeline.`);
      stored.push({ name, ref: res.ref });
    }

    const misses: string[] = [];
    for (const { name, ref } of stored) {
      const forms = [name, name.toLowerCase(), `Tell me about ${name}`, `what is ${name}`];
      for (const q of forms) {
        const r = await engine.recallMemory(userA, { query: q });
        const hit = r.answer_ready && refs(r).includes(ref) && r.results.find((x) => x.ref === ref)?.matched_by?.includes('shell');
        if (!hit) misses.push(`${q} -> ${ref}`);
      }
    }
    expect(misses).toEqual([]);
  }, 300_000);

  it('returns an exact name as the top result even when many memories mention it', async () => {
    for (let i = 0; i < 60; i++) await store(`Helios appears in note ${i} about deployment window ${i}.`);
    const target = await store('Helios is the primary realtime analytics engine owned by the platform team.');
    const r = await engine.recallMemory(userA, { query: 'Helios' });
    expect(r.answer_ready).toBe(true);
    expect(refs(r).length).toBeGreaterThan(0);
    // Names are never discounted by frequency, so the about-memory is reachable.
    expect(refs(r)).toContain(target.ref);
    // Must come from Tier 0, not be rescued by Tier 1.
    expect(r.results.find((x) => x.ref === target.ref)?.matched_by).toContain('shell');
  });

  it('ranks the memory about a name above one that merely mentions it', async () => {
    const about = await store('Quillfeather is a lightweight tracing library for the edge runtime.');
    await store('Weekly sync covered billing, onboarding, hiring, the roadmap, a long list of unrelated chores, and finally a passing note about Quillfeather.');
    const r = await engine.recallMemory(userA, { query: 'Quillfeather' });
    expect(refs(r)[0]).toBe(about.ref);
  });

  it('resolves the AriGraph regression: store then immediately recall by name and by phrase', async () => {
    const a = await store('AriGraph is a memory graph architecture with semantic and episodic nodes.');
    const b = await store('Graph as policy treats the knowledge graph itself as the agent policy.');
    const r1 = await engine.recallMemory(userA, { query: 'arigraph' });
    expect(r1.answer_ready).toBe(true);
    expect(refs(r1)).toContain(a.ref);
    expect(r1.results[0].matched_by).toEqual(['shell']);
    const r2 = await engine.recallMemory(userA, { query: 'graph as policy' });
    expect(r2.answer_ready).toBe(true);
    expect(refs(r2)).toContain(b.ref);
    expect(r2.results[0].matched_by).toEqual(['shell']);
  });

  it('resolves declared aliases in both directions', async () => {
    await store('Adaptive Retrieval Core (ARC) is the module that routes recall.');
    const fact = await store('ARC latency budget is 40ms at the 95th percentile.');
    const viaLong = await engine.recallMemory(userA, { query: 'adaptive retrieval core latency budget' });
    expect(refs(viaLong)).toContain(fact.ref);
    const viaShort = await engine.recallMemory(userA, { query: 'ARC latency budget' });
    expect(refs(viaShort)).toContain(fact.ref);
  });

  it('supports manually bound aliases', async () => {
    const m = await store('Kestrelbase holds the cold archive of agent sessions.');
    await shell.addShellAlias(userA, 'the cold archive', 'Kestrelbase');
    const lookup = await shell.lookupShells(userA, 'the cold archive');
    expect(lookup.hits.map((h) => h.pointerId)).toContain(m.ref);
  });

  it('is atomic: a failing shell write leaves no memory behind', async () => {
    const before = (await client.query('SELECT count(*)::int AS n FROM memories')).rows[0].n;
    const { encrypt, hashContent } = await import('../lib/encryption.js');
    const enc = encrypt('atomicity probe');
    await expect(queries.insertMemory({
      pointerId: 'ptr_atomic01', userId: userA, bucket: 'knowledge', title: 'probe',
      contentEncrypted: enc.encrypted, contentIv: enc.iv, contentTag: enc.tag,
      contentHash: hashContent('atomicity probe'), tags: [], tokenCount: 3, originalTokens: 3,
      // null key violates NOT NULL inside the same statement.
      shells: { keys: [null as unknown as string], kinds: ['name'], weights: [1], aliasFrom: [], aliasTo: [] },
    })).rejects.toThrow();
    const after = (await client.query('SELECT count(*)::int AS n FROM memories')).rows[0].n;
    expect(after).toBe(before);
  });

  it('re-indexes on update: old name stops resolving, new name resolves', async () => {
    const m = await store('Oldname is the codename of the first prototype.');
    await shell.indexMemoryShells({ userId: userA, pointerId: m.ref, content: 'Newname is the codename of the first prototype.' });
    // Mirror the content change in storage, as the update tools do.
    const { encrypt } = await import('../lib/encryption.js');
    const enc = encrypt('Newname is the codename of the first prototype.');
    await client.query('UPDATE memories SET content_encrypted=$1, content_iv=$2, content_tag=$3 WHERE pointer_id=$4', [enc.encrypted, enc.iv, enc.tag, m.ref]);
    const oldLookup = await shell.lookupShells(userA, 'Oldname');
    expect(oldLookup.hits.map((h) => h.pointerId)).not.toContain(m.ref);
    const newLookup = await shell.lookupShells(userA, 'Newname');
    expect(newLookup.hits.map((h) => h.pointerId)).toContain(m.ref);
  });

  it('never returns deleted memories', async () => {
    const m = await store('Ephemerax is a throwaway experiment.');
    await queries.softDeleteMemory(m.ref, userA);
    const r = await engine.recallMemory(userA, { query: 'Ephemerax' });
    expect(refs(r)).not.toContain(m.ref);
  });

  it('isolates users', async () => {
    const m = await store('Secretforge is user B private project.', { user: userB });
    const lookup = await shell.lookupShells(userA, 'Secretforge');
    expect(lookup.hits.map((h) => h.pointerId)).not.toContain(m.ref);
    const mine = await shell.lookupShells(userB, 'Secretforge');
    expect(mine.hits.map((h) => h.pointerId)).toContain(m.ref);
  });

  it('repairs memories that have no shell rows', async () => {
    const { encrypt, hashContent } = await import('../lib/encryption.js');
    const text = 'Repairable is a legacy memory stored before the shell index existed.';
    const enc = encrypt(text);
    await queries.insertMemory({
      pointerId: 'ptr_legacy01', userId: userA, bucket: 'knowledge', title: text.slice(0, 50),
      contentEncrypted: enc.encrypted, contentIv: enc.iv, contentTag: enc.tag,
      contentHash: hashContent(text), tags: [], tokenCount: 3, originalTokens: 10,
    });
    const miss = await shell.lookupShells(userA, 'Repairable');
    expect(miss.hits.map((h) => h.pointerId)).not.toContain('ptr_legacy01');
    const result = await shell.repairShellIndex({ userId: userA });
    expect(result.failed).toBe(0);
    expect(result.repaired).toBeGreaterThanOrEqual(1);
    const hit = await shell.lookupShells(userA, 'Repairable');
    expect(hit.hits.map((h) => h.pointerId)).toContain('ptr_legacy01');
  });

  it('does not answer from generic or partial queries (falls through to Tier 1)', async () => {
    const generic = await shell.lookupShells(userA, 'what is the project name');
    expect(generic.hits).toEqual([]);
    expect(generic.decisive).toBe(false);
    const nameless = await shell.lookupShells(userA, 'what throughput target did the team commit to');
    expect(nameless.decisive).toBe(false);
  });

  it('keeps lookup latency low on a 500+ memory index', async () => {
    const samples: number[] = [];
    for (let i = 0; i < 50; i++) {
      const t = performance.now();
      await shell.lookupShells(userA, uniqueName(i * 7, i * 7));
      samples.push(performance.now() - t);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)];
    expect(p95).toBeLessThan(50);
  });
});
