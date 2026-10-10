/**
 * Real-world recall scenarios against the REAL migrated schema (Postgres +
 * pgvector, the same DDL as production/Supabase).
 *
 *   MEMRON_TEST_PG_FULL=postgres://postgres@localhost:5433/memron_full \
 *     pnpm vitest run shell-scenarios
 *
 * Scenarios:
 *  1. One name, many memories across workspaces ("Jev" x3): return all, grouped.
 *  2. "<name> related": direct hits plus memories linked through rare names.
 *  3. A very common keyword ("coding") must not drown a rare, accurate one.
 *  4. The anchor memory (holds the rarest keyword, misses common ones) survives.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const PG_URL = process.env.MEMRON_TEST_PG_FULL;
const run = PG_URL || process.env.MEMRON_REQUIRE_PG === '1' ? describe : describe.skip;

type Engine = typeof import('../engine/unified-memory-engine.js');
let engine: Engine;
let client: typeof import('../db/client.js');
let userId = 0;
const queue = { send: async () => undefined };

const store = (content: string, space?: string, tags?: string[]) =>
  engine.storeMemory(userId, { content, space, tags }, { queue });
const refs = (r: { results: Array<{ ref: string }> }) => r.results.map((x) => x.ref);

run('Tier 0 scenarios (real migrated schema)', () => {
  beforeAll(async () => {
    const url = new URL(PG_URL || 'postgres://postgres@localhost:5433/memron_full');
    process.env.PG_HOST = url.hostname;
    process.env.PG_PORT = url.port || '5432';
    process.env.PG_USER = decodeURIComponent(url.username || 'postgres');
    process.env.PG_PASSWORD = decodeURIComponent(url.password || '');
    process.env.PG_DATABASE = url.pathname.slice(1);
    process.env.PG_SSL = 'false';
    process.env.ENCRYPTION_SECRET ||= 'test-encryption-secret-for-shell-suite';
    process.env.JWT_SECRET ||= 'test-jwt-secret-for-shell-suite';
    client = await import('../db/client.js');
    const { runMigrations } = await import('../db/schema.js');
    await runMigrations();
    engine = await import('../engine/unified-memory-engine.js');
  }, 120_000);

  beforeEach(async () => {
    await client.query('TRUNCATE shell_aliases, shell_index, memories RESTART IDENTITY CASCADE');
    await client.query('DELETE FROM users WHERE email = $1', ['scenarios@test']);
    userId = (await client.query('INSERT INTO users(email) VALUES ($1) RETURNING id', ['scenarios@test'])).rows[0].id;
  });

  afterAll(async () => {
    await client?.query('DELETE FROM users WHERE email = $1', ['scenarios@test']).catch(() => undefined);
    await client?.close().catch(() => undefined);
  });

  it('1. returns every memory behind one name, across workspaces, grouped by space', async () => {
    const work = await store('Jev is the founder and sets the product roadmap priorities for Memron.', 'work');
    const personal = await store('Jev prefers short written updates and dislikes long meetings.', 'personal');
    const sprint = await store('Sprint review: Jev approved the new onboarding flow and asked for a demo.', 'sprint');
    await store('Unrelated note about the quarterly invoice schedule.', 'work');

    const r = await engine.recallMemory(userId, { query: 'Jev' });
    expect(r.answer_ready).toBe(true);
    expect(refs(r)).toEqual(expect.arrayContaining([work.ref, personal.ref, sprint.ref]));
    expect(new Set(r.results.map((x) => x.space))).toEqual(new Set(['work', 'personal', 'sprint']));
    for (const x of r.results) expect(x.matched_by).toEqual(['shell']);
  });

  it('1b. a tight budget still shows one memory per workspace before a second from the same one', async () => {
    await store('Jev runs the weekly planning review for the platform team and owns its agenda.', 'work');
    await store('Jev also leads the platform team retro and writes the follow up notes after it.', 'work');
    await store('Jev likes hiking on weekends and prefers early flights for travel.', 'personal');
    const r = await engine.recallMemory(userId, { query: 'Jev', budget: 40 });
    const spaces = r.results.map((x) => x.space);
    expect(spaces).toContain('work');
    expect(spaces).toContain('personal');
  });

  it('2. "jev related" returns all Jev memories plus memories linked through a rare shared name', async () => {
    const a = await store('Jev owns the Orbit Sync migration and reviews its rollout plan.', 'work');
    const b = await store('Jev wants the dashboard redesign finished before the offsite.', 'sprint');
    const linked = await store('Orbit Sync is the replication layer that keeps regional databases consistent.', 'infra');
    await store('The cafeteria menu changes every Monday.', 'misc');

    const r = await engine.recallMemory(userId, { query: 'jev related' });
    expect(r.answer_ready).toBe(true);
    expect(refs(r)).toEqual(expect.arrayContaining([a.ref, b.ref]));
    const rel = r.results.find((x) => x.ref === linked.ref);
    expect(rel).toBeDefined();
    expect(rel!.matched_by).toEqual(['shell_related']);
    // Related memories never outrank direct ones.
    expect(refs(r).indexOf(linked.ref)).toBeGreaterThan(Math.max(refs(r).indexOf(a.ref), refs(r).indexOf(b.ref)));
  });

  it('3. a very common keyword does not drown the rare accurate memory', async () => {
    for (let i = 0; i < 150; i++) await store(`Coding session ${i}: practiced exercises on topic number ${i} today.`, 'learning');
    const accurate = await store('Latency budget for the realtime gateway is 40ms at the 95th percentile.', 'infra');
    const r = await engine.recallMemory(userId, { query: 'coding latency budget' });
    expect(r.answer_ready).toBe(true);
    expect(refs(r)[0]).toBe(accurate.ref);
  });

  it('3b. a memory matching all keywords beats one matching only some', async () => {
    for (let i = 0; i < 60; i++) await store(`Coding drill ${i}: warmup number ${i} of the practice routine.`, 'learning');
    const partial = await store('Latency budget for the realtime gateway is 40ms at the 95th percentile.', 'infra');
    const full = await store('Coding guideline: every change must state its latency budget in the pull request.', 'eng');
    const r = await engine.recallMemory(userId, { query: 'coding latency budget' });
    const order = refs(r);
    expect(order[0]).toBe(full.ref);
    expect(order).toContain(partial.ref);
    expect(order.indexOf(full.ref)).toBeLessThan(order.indexOf(partial.ref));
  });

  it('4. the anchor memory survives even though it misses the common keyword', async () => {
    for (let i = 0; i < 120; i++) await store(`Coding kata ${i}: solved puzzle number ${i} in the practice set.`, 'learning');
    const anchor = await store('Quasarwave is the internal codename for the streaming ingestion service.', 'infra');
    const r = await engine.recallMemory(userId, { query: 'quasarwave coding' });
    expect(r.answer_ready).toBe(true);
    expect(refs(r)).toContain(anchor.ref);
    expect(refs(r)[0]).toBe(anchor.ref);
  });

  it('5. generic-only queries do not return arbitrary memories from Tier 0', async () => {
    for (let i = 0; i < 20; i++) await store(`Project note ${i}: the project name was discussed in meeting ${i}.`);
    const r = await engine.recallMemory(userId, { query: 'what is the project name' });
    for (const x of r.results) expect(x.matched_by).not.toContain('shell');
  });
});
