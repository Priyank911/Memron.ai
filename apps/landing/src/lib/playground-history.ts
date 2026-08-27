/**
 * Playground History — Production-grade chat storage with JSONB messages.
 *
 * Schema:
 *   playground_sessions    — one row per conversation, messages stored inline as JSONB array
 *   playground_embeddings  — sparse embedding index (user queries only, for vector search)
 *
 * Benefits over per-message rows:
 *   - 1000 sessions = 1000 rows (vs 100K+ message rows)
 *   - Single SELECT to load full conversation (no JOIN)
 *   - Atomic append via JSONB concatenation
 *   - PostgreSQL TOAST handles compression automatically
 *   - ChatGPT-style auto-generated titles via Groq LLM
 *   - RLS enabled for PostgREST security
 *
 * JSONB message format:
 *   [{ role, content, ts, bucket?, model?, tokens?, latency?, memoryIds? }]
 */

import { supaQuery, resolveSupabaseUser } from '@/lib/supabase-read';
import { embedQuery, toPgVector } from '@/lib/embeddings';
import OpenAI from 'openai';

// ─── Schema (idempotent) ────────────────────────────────────

const SCHEMA_SQLS = [
  `CREATE TABLE IF NOT EXISTS playground_sessions (
    id              SERIAL PRIMARY KEY,
    session_id      VARCHAR(64) UNIQUE NOT NULL,
    user_id         INTEGER NOT NULL,
    title           VARCHAR(200) NOT NULL DEFAULT 'New Chat',
    messages        JSONB NOT NULL DEFAULT '[]',
    message_count   INTEGER DEFAULT 0,
    total_tokens    INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
  )`,

  // Add messages column if upgrading from previous schema
  `ALTER TABLE playground_sessions ADD COLUMN IF NOT EXISTS messages JSONB NOT NULL DEFAULT '[]'`,

  // Add pinned column if upgrading
  `ALTER TABLE playground_sessions ADD COLUMN IF NOT EXISTS pinned BOOLEAN NOT NULL DEFAULT false`,

  `CREATE TABLE IF NOT EXISTS playground_embeddings (
    id              SERIAL PRIMARY KEY,
    session_id      VARCHAR(64) NOT NULL REFERENCES playground_sessions(session_id) ON DELETE CASCADE,
    content         TEXT NOT NULL,
    answer          TEXT NOT NULL DEFAULT '',
    bucket          VARCHAR(100),
    embedding       vector(768),
    created_at      TIMESTAMPTZ DEFAULT NOW()
  )`,

  `CREATE INDEX IF NOT EXISTS idx_ps_user ON playground_sessions(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_ps_updated ON playground_sessions(updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_pe_session ON playground_embeddings(session_id)`,
];

const HNSW_SQL = `DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'idx_pe_embedding_hnsw'
  ) THEN
    CREATE INDEX idx_pe_embedding_hnsw ON playground_embeddings
      USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64);
  END IF;
END $$`;

const RLS_SQL = `DO $$
DECLARE t TEXT; r TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['playground_sessions','playground_embeddings'] LOOP
    EXECUTE format('ALTER TABLE IF EXISTS %I ENABLE ROW LEVEL SECURITY', t);
    FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
      EXECUTE format('REVOKE ALL ON %I FROM %I', t, r);
    END LOOP;
  END LOOP;
END $$`;

let schemaReady = false;

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  try {
    for (const sql of SCHEMA_SQLS) await supaQuery(sql);
    await supaQuery(HNSW_SQL);
    await supaQuery(RLS_SQL);
    await migrateFromLegacy();
    await migrateFromMessageRows();
    schemaReady = true;
  } catch (err: any) {
    console.warn('[PlaygroundHistory] Schema warning:', err.message);
    schemaReady = true;
  }
}

// ─── Migration: legacy playground_history table ─────────────

async function migrateFromLegacy(): Promise<void> {
  try {
    const old = await supaQuery(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'playground_history'
       ) AS ok`,
    );
    if (!old.rows[0]?.ok) return;

    const fresh = await supaQuery(
      'SELECT EXISTS (SELECT 1 FROM playground_sessions LIMIT 1) AS ok',
    );
    if (fresh.rows[0]?.ok) return;

    const hasData = await supaQuery(
      'SELECT EXISTS (SELECT 1 FROM playground_history LIMIT 1) AS ok',
    );
    if (!hasData.rows[0]?.ok) return;

    console.log('[PlaygroundHistory] Migrating from legacy table…');

    const groups = await supaQuery(`
      SELECT session_id, user_id,
             (array_agg(query ORDER BY created_at))[1] AS first_query,
             COUNT(*)::int AS pair_count,
             COALESCE(SUM(tokens_used), 0)::int AS total_tok,
             MIN(created_at) AS c_at,
             MAX(created_at) AS u_at
      FROM playground_history
      GROUP BY session_id, user_id
      ORDER BY MAX(created_at) DESC
    `);

    for (const g of groups.rows) {
      const rows = await supaQuery(
        `SELECT query, answer, embedding, model, tokens_used, latency_ms, memory_ids, bucket, created_at
         FROM playground_history
         WHERE session_id = $1 AND user_id = $2
         ORDER BY created_at ASC`,
        [g.session_id, g.user_id],
      );

      // Build JSONB messages array
      const msgs: any[] = [];
      for (const r of rows.rows) {
        msgs.push({
          role: 'user', content: r.query,
          ts: new Date(r.created_at).getTime(), bucket: r.bucket || null,
        });
        msgs.push({
          role: 'assistant', content: r.answer,
          ts: new Date(r.created_at).getTime() + 1,
          model: r.model, tokens: r.tokens_used, latency: r.latency_ms,
          memoryIds: r.memory_ids || [], bucket: r.bucket || null,
        });
      }

      await supaQuery(
        `INSERT INTO playground_sessions
           (session_id, user_id, title, messages, message_count, total_tokens, created_at, updated_at)
         VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8)
         ON CONFLICT (session_id) DO NOTHING`,
        [g.session_id, g.user_id, (g.first_query || 'Untitled').slice(0, 60),
         JSON.stringify(msgs), g.pair_count * 2, g.total_tok, g.c_at, g.u_at],
      );

      // Migrate embeddings to sparse table
      for (const r of rows.rows) {
        if (r.embedding) {
          await supaQuery(
            `INSERT INTO playground_embeddings (session_id, content, answer, bucket, embedding, created_at)
             VALUES ($1, $2, $3, $4, $5::vector, $6)`,
            [g.session_id, r.query, r.answer, r.bucket || null, r.embedding, r.created_at],
          );
        }
      }
    }

    console.log(`[PlaygroundHistory] Migrated ${groups.rows.length} legacy sessions`);
  } catch (err: any) {
    console.warn('[PlaygroundHistory] Legacy migration skipped:', err.message);
  }
}

// ─── Migration: per-row playground_messages → JSONB ─────────

async function migrateFromMessageRows(): Promise<void> {
  try {
    const hasMsgTable = await supaQuery(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'playground_messages'
       ) AS ok`,
    );
    if (!hasMsgTable.rows[0]?.ok) return;

    // Check if any sessions still have empty JSONB (need migration)
    const needsMigrate = await supaQuery(
      `SELECT ps.session_id FROM playground_sessions ps
       WHERE ps.messages = '[]'::jsonb AND ps.message_count > 0
       LIMIT 1`,
    );
    if (!needsMigrate.rows[0]) {
      // No migration needed — drop old table
      await supaQuery('DROP TABLE IF EXISTS playground_messages CASCADE');
      return;
    }

    console.log('[PlaygroundHistory] Migrating message rows to JSONB…');

    const sessions = await supaQuery(
      `SELECT ps.session_id FROM playground_sessions ps
       WHERE ps.messages = '[]'::jsonb AND ps.message_count > 0`,
    );

    for (const s of sessions.rows) {
      const msgs = await supaQuery(
        `SELECT role, content, metadata, embedding, created_at
         FROM playground_messages
         WHERE session_id = $1
         ORDER BY created_at ASC`,
        [s.session_id],
      );

      const jsonMsgs = msgs.rows.map((m: any) => {
        const meta = m.metadata || {};
        const base: any = {
          role: m.role,
          content: m.content,
          ts: new Date(m.created_at).getTime(),
        };
        if (m.role === 'user') {
          base.bucket = meta.bucket || null;
        } else {
          base.model = meta.model;
          base.tokens = meta.tokens_used;
          base.latency = meta.latency_ms;
          base.memoryIds = meta.memory_ids || [];
          base.bucket = meta.bucket || null;
        }
        return base;
      });

      await supaQuery(
        `UPDATE playground_sessions SET messages = $2::jsonb WHERE session_id = $1`,
        [s.session_id, JSON.stringify(jsonMsgs)],
      );

      // Migrate embeddings to sparse table
      for (const m of msgs.rows) {
        if (m.embedding && m.role === 'user') {
          const nextAssistant = msgs.rows.find(
            (a: any) => a.role === 'assistant' && new Date(a.created_at) > new Date(m.created_at),
          );
          await supaQuery(
            `INSERT INTO playground_embeddings (session_id, content, answer, bucket, embedding, created_at)
             VALUES ($1, $2, $3, $4, $5::vector, $6)`,
            [s.session_id, m.content, nextAssistant?.content || '',
             (m.metadata?.bucket) || null, m.embedding, m.created_at],
          );
        }
      }
    }

    // Drop old per-row table
    await supaQuery('DROP TABLE IF EXISTS playground_messages CASCADE');
    console.log(`[PlaygroundHistory] Migrated ${sessions.rows.length} sessions to JSONB`);
  } catch (err: any) {
    console.warn('[PlaygroundHistory] Message migration skipped:', err.message);
  }
}

// ─── Types ──────────────────────────────────────────────────

export interface SaveInteractionInput {
  clerkId: string;
  sessionId: string;
  bucket: string | null;
  query: string;
  answer: string;
  memoryIds: string[];
  tokensUsed: number;
  model: string;
  latencyMs: number;
}

export interface HistorySession {
  sessionId: string;
  title: string;
  lastMessage: string;
  messageCount: number;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HistoryMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface SimilarQA {
  query: string;
  answer: string;
  bucket: string | null;
  similarity: number;
  createdAt: string;
}

// ─── Title generation (ChatGPT-style) ───────────────────────

const _g = globalThis as unknown as { __openaiTitleClient?: OpenAI };

function openaiTitleClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  if (!_g.__openaiTitleClient) _g.__openaiTitleClient = new OpenAI({ apiKey: key });
  return _g.__openaiTitleClient;
}

async function generateTitle(firstMessage: string): Promise<string> {
  const client = openaiTitleClient();
  if (!client) return firstMessage.slice(0, 50);
  try {
    const res = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Generate a concise 3-6 word title summarizing this chat message. Reply with ONLY the title, no quotes, no trailing punctuation.' },
        { role: 'user', content: firstMessage.slice(0, 300) },
      ],
      temperature: 0,
      max_tokens: 20,
    });
    const raw = res.choices?.[0]?.message?.content?.trim()
      .replace(/^["']|["']$/g, '').replace(/\.$/, '');
    return raw && raw.length <= 100 ? raw : firstMessage.slice(0, 50);
  } catch {
    return firstMessage.slice(0, 50);
  }
}

// ─── Save interaction ───────────────────────────────────────

export async function saveInteraction(
  input: SaveInteractionInput,
): Promise<{ title?: string }> {
  await ensureSchema();

  const user = await resolveSupabaseUser(input.clerkId);
  if (!user) return {};

  const now = Date.now();

  // Build JSONB message pair
  const newMessages = [
    {
      role: 'user', content: input.query,
      ts: now, bucket: input.bucket || null,
    },
    {
      role: 'assistant', content: input.answer,
      ts: now + 1, model: input.model, tokens: input.tokensUsed,
      latency: input.latencyMs, memoryIds: input.memoryIds,
      bucket: input.bucket || null,
    },
  ];

  // Check if session exists
  const existing = await supaQuery(
    'SELECT message_count FROM playground_sessions WHERE session_id = $1 AND user_id = $2',
    [input.sessionId, user.id],
  );
  const isFirst = !existing.rows[0] || existing.rows[0].message_count === 0;

  if (!existing.rows[0]) {
    // Create new session with initial messages
    await supaQuery(
      `INSERT INTO playground_sessions
         (session_id, user_id, title, messages, message_count, total_tokens)
       VALUES ($1, $2, $3, $4::jsonb, 2, $5)
       ON CONFLICT (session_id) DO NOTHING`,
      [input.sessionId, user.id, input.query.slice(0, 50),
       JSON.stringify(newMessages), input.tokensUsed],
    );
  } else {
    // Append to existing session — atomic JSONB concat
    await supaQuery(
      `UPDATE playground_sessions
       SET messages = messages || $2::jsonb,
           message_count = message_count + 2,
           total_tokens  = total_tokens + $3,
           updated_at    = NOW()
       WHERE session_id = $1`,
      [input.sessionId, JSON.stringify(newMessages), input.tokensUsed],
    );
  }

  // Index user query embedding for semantic search (fire-and-forget)
  embedQuery(input.query).then(async (embedding) => {
    if (!embedding) return;
    try {
      await supaQuery(
        `INSERT INTO playground_embeddings (session_id, content, answer, bucket, embedding)
         VALUES ($1, $2, $3, $4, $5::vector)`,
        [input.sessionId, input.query, input.answer,
         input.bucket || null, toPgVector(embedding)],
      );
    } catch { /* non-critical */ }
  }).catch(() => {});

  // Auto-generate title on first exchange
  let generatedTitle: string | undefined;
  if (isFirst) {
    try {
      generatedTitle = await generateTitle(input.query);
      await supaQuery(
        'UPDATE playground_sessions SET title = $2 WHERE session_id = $1',
        [input.sessionId, generatedTitle],
      );
    } catch { /* non-critical */ }
  }

  return { title: generatedTitle };
}

// ─── List sessions ──────────────────────────────────────────

export async function listSessions(
  clerkId: string,
  limit = 50,
): Promise<HistorySession[]> {
  await ensureSchema();

  const user = await resolveSupabaseUser(clerkId);
  if (!user) return [];

  const result = await supaQuery(
    `SELECT session_id, title, message_count, pinned, created_at, updated_at,
            messages->-1->>'content' AS last_msg
     FROM playground_sessions
     WHERE user_id = $1 AND message_count > 0
     ORDER BY pinned DESC, updated_at DESC
     LIMIT $2`,
    [user.id, limit],
  );

  return result.rows.map((r: any) => ({
    sessionId: r.session_id,
    title: r.title || 'Untitled',
    lastMessage: (r.last_msg || '').slice(0, 60),
    messageCount: r.message_count,
    pinned: !!r.pinned,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

// ─── Get session messages ───────────────────────────────────

export async function getSessionMessages(
  clerkId: string,
  sessionId: string,
): Promise<HistoryMessage[]> {
  await ensureSchema();

  const user = await resolveSupabaseUser(clerkId);
  if (!user) return [];

  const result = await supaQuery(
    'SELECT messages FROM playground_sessions WHERE session_id = $1 AND user_id = $2',
    [sessionId, user.id],
  );

  const raw = result.rows[0]?.messages;
  if (!raw || !Array.isArray(raw)) return [];

  return raw.map((m: any, i: number) => ({
    id: i + 1,
    role: m.role,
    content: m.content,
    metadata: m.role === 'user'
      ? { bucket: m.bucket || null }
      : { model: m.model, tokens_used: m.tokens, latency_ms: m.latency,
          memory_ids: m.memoryIds || [], bucket: m.bucket || null },
    createdAt: new Date(m.ts).toISOString(),
  }));
}

// ─── Delete session ─────────────────────────────────────────

export async function deleteSession(
  clerkId: string,
  sessionId: string,
): Promise<boolean> {
  await ensureSchema();

  const user = await resolveSupabaseUser(clerkId);
  if (!user) return false;

  const result = await supaQuery(
    'DELETE FROM playground_sessions WHERE session_id = $1 AND user_id = $2',
    [sessionId, user.id],
  );

  return (result.rowCount ?? 0) > 0;
}

// ─── Semantic search over history ───────────────────────────

export async function searchHistory(
  clerkId: string,
  queryText: string,
  bucket: string | null = null,
  limit = 5,
): Promise<SimilarQA[]> {
  await ensureSchema();

  const user = await resolveSupabaseUser(clerkId);
  if (!user) return [];

  const qEmb = await embedQuery(queryText);
  if (!qEmb) return [];
  const embStr = toPgVector(qEmb);

  try {
    const result = await supaQuery(
      `SELECT pe.content AS query, pe.answer, pe.bucket, pe.created_at,
              (1 - (pe.embedding <=> $2::vector)) AS similarity
       FROM playground_embeddings pe
       JOIN playground_sessions ps ON ps.session_id = pe.session_id AND ps.user_id = $1
       WHERE pe.embedding IS NOT NULL
       ORDER BY pe.embedding <=> $2::vector
       LIMIT $3`,
      [user.id, embStr, limit],
    );

    return result.rows
      .filter((r: any) => r.similarity > 0.3)
      .map((r: any) => ({
        query: r.query,
        answer: r.answer || '',
        bucket: r.bucket || null,
        similarity: parseFloat(r.similarity),
        createdAt: r.created_at,
      }));
  } catch (err: any) {
    console.warn('[PlaygroundHistory] Search failed:', err.message);
    return [];
  }
}

// ─── Similar Q&A for RAG few-shot context ───────────────────

export async function getSimilarQAForContext(
  userId: number,
  queryText: string,
  bucket: string | null = null,
  limit = 3,
): Promise<SimilarQA[]> {
  const qEmb = await embedQuery(queryText);
  if (!qEmb) return [];
  const embStr = toPgVector(qEmb);

  try {
    const result = await supaQuery(
      `SELECT pe.content AS query, pe.answer, pe.bucket, pe.created_at,
              (1 - (pe.embedding <=> $2::vector)) AS similarity
       FROM playground_embeddings pe
       JOIN playground_sessions ps ON ps.session_id = pe.session_id AND ps.user_id = $1
       WHERE pe.embedding IS NOT NULL
       ORDER BY pe.embedding <=> $2::vector
       LIMIT $3`,
      [userId, embStr, limit],
    );

    return result.rows
      .filter((r: any) => r.similarity > 0.5)
      .map((r: any) => ({
        query: r.query,
        answer: r.answer || '',
        bucket: r.bucket || null,
        similarity: parseFloat(r.similarity),
        createdAt: r.created_at,
      }));
  } catch {
    return [];
  }
}

// ─── Fetch session title (for client polling) ───────────────

export async function getSessionTitle(
  clerkId: string,
  sessionId: string,
): Promise<string | null> {
  const user = await resolveSupabaseUser(clerkId);
  if (!user) return null;
  const r = await supaQuery(
    'SELECT title FROM playground_sessions WHERE session_id = $1 AND user_id = $2',
    [sessionId, user.id],
  );
  return r.rows[0]?.title ?? null;
}

// ─── Update session title ───────────────────────────────────

export async function updateSessionTitle(
  clerkId: string,
  sessionId: string,
  newTitle: string,
): Promise<boolean> {
  await ensureSchema();
  const user = await resolveSupabaseUser(clerkId);
  if (!user) return false;
  const r = await supaQuery(
    'UPDATE playground_sessions SET title = $3 WHERE session_id = $1 AND user_id = $2',
    [sessionId, user.id, newTitle.slice(0, 200)],
  );
  return (r.rowCount ?? 0) > 0;
}

// ─── Toggle session pin ─────────────────────────────────────

export async function toggleSessionPin(
  clerkId: string,
  sessionId: string,
): Promise<boolean | null> {
  await ensureSchema();
  const user = await resolveSupabaseUser(clerkId);
  if (!user) return null;
  const r = await supaQuery(
    `UPDATE playground_sessions SET pinned = NOT pinned
     WHERE session_id = $1 AND user_id = $2
     RETURNING pinned`,
    [sessionId, user.id],
  );
  return r.rows[0]?.pinned ?? null;
}
