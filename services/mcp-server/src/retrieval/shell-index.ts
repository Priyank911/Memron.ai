/**
 * Tier 0: Memory Shells.
 *
 * A shell is a synchronous, deterministic lock-and-key address:
 *   blind_hash(normalized key) -> pointer_id[]
 *
 * Keys are extracted from the memory BODY (not only the title) at store time
 * with pure string logic: no embedding call, no queue, no LLM. A recall that
 * names a thing the way it was stored resolves by dereferencing the address
 * instead of weighing probabilistic evidence.
 *
 * Privacy: keys are stored as HMAC blind hashes, never plaintext, the same
 * scheme the legacy sovereign graph uses.
 */
import { query } from '../db/client.js';
import { computeBlindHash } from '../lib/blind-index.js';

export type ShellKind = 'entity' | 'phrase' | 'term';

export interface ShellKey {
  key: string;
  kind: ShellKind;
  weight: number;
}

const KIND_WEIGHT: Record<ShellKind, number> = { entity: 1.0, phrase: 0.6, term: 0.3 };
const MAX_KEYS_PER_MEMORY = 120;
const MAX_QUERY_KEYS = 60;
/** Keys that point at more memories than this are not discriminative. */
const MAX_TERM_DF = 40;

const STOP = new Set([
  'a', 'about', 'above', 'after', 'again', 'all', 'also', 'am', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'both', 'but', 'by', 'can', 'could', 'did', 'do', 'does',
  'doing', 'each', 'few', 'find', 'for', 'from', 'get', 'give', 'had', 'has', 'have', 'having', 'he',
  'her', 'here', 'him', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'just', 'let', 'like',
  'me', 'more', 'most', 'my', 'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once', 'only', 'or',
  'other', 'our', 'out', 'over', 'own', 'recall', 'remember', 'same', 'say', 'she', 'should', 'show',
  'so', 'some', 'such', 'tell', 'than', 'that', 'the', 'their', 'them', 'then', 'there', 'these',
  'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'us', 'very', 'was', 'we',
  'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'will', 'with', 'would',
  'you', 'your', 'describe', 'description', 'explain', 'please',
]);

/** Generic words that can help ranking but must never anchor an answer alone. */
const GENERIC = new Set([
  'change', 'changes', 'context', 'data', 'detail', 'details', 'identity', 'information', 'made',
  'memory', 'memories', 'name', 'person', 'project', 'retrieve', 'stored', 'thing', 'things', 'use',
  'used', 'using', 'note', 'notes', 'stuff', 'work', 'new', 'old',
]);

export function normalizeKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[‘’“”]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
}

function stem(word: string): string {
  if (word.length <= 4) return word;
  if (word.endsWith('ies') && word.length > 5) return `${word.slice(0, -3)}y`;
  if (word.endsWith('ing') && word.length > 6) return word.slice(0, -3);
  if (word.endsWith('ed') && word.length > 5) return word.slice(0, -2);
  if (word.endsWith('es') && word.length > 5) return word.slice(0, -2);
  if (word.endsWith('s') && word.length > 4 && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** Content words: stopwords out, light stemming so "graphs" and "graph" share an address. */
function contentWords(text: string): string[] {
  return words(text)
    .filter((w) => w.length >= 2 && !STOP.has(w))
    .map(stem);
}

/** "AriGraph" -> "ari graph", "HippoRAG" -> "hippo rag", "GPT-4" -> "gpt 4". */
function splitCompound(token: string): string | null {
  const spaced = token
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[._-]+/g, ' ');
  const key = normalizeKey(spaced);
  return key.includes(' ') ? key : null;
}

function isCompoundToken(token: string): boolean {
  return /[a-z][A-Z]/.test(token) || /[A-Z]{2,}[a-z]/.test(token) || /[A-Za-z][._-][A-Za-z0-9]/.test(token) || (/[A-Za-z]/.test(token) && /\d/.test(token));
}

function pushUnique(map: Map<string, ShellKey>, key: string, kind: ShellKind): void {
  const normalized = normalizeKey(key);
  if (normalized.length < 2) return;
  const existing = map.get(normalized);
  const weight = KIND_WEIGHT[kind];
  if (!existing || existing.weight < weight) map.set(normalized, { key: normalized, kind, weight });
}

/**
 * Extract shell keys from a memory. Pure and fast (single pass, no I/O).
 * Entities: capitalized spans, compound tokens, quoted spans, tags.
 * Phrases: adjacent content-word pairs inside a clause.
 * Terms: significant content words (this is what makes the BODY addressable).
 */
export function extractShellKeys(content: string, tags: string[] = []): ShellKey[] {
  const keys = new Map<string, ShellKey>();
  const text = content.slice(0, 20_000);

  // Quoted spans are explicit names.
  for (const m of text.matchAll(/["`“]([^"`”\n]{2,60})["`”]/g)) pushUnique(keys, m[1], 'entity');

  // Capitalized multi-word spans, e.g. "Cloudflare Workers", "Jev AI".
  for (const m of text.matchAll(/\b([A-Z][A-Za-z0-9._-]*(?:\s+[A-Z][A-Za-z0-9._-]*){1,3})\b/g)) {
    const span = m[1];
    const parts = span.split(/\s+/);
    if (parts.every((p) => STOP.has(p.toLowerCase()))) continue;
    // Drop a leading stopword such as "The" or "What".
    const trimmed = parts.filter((p, i) => !(i === 0 && STOP.has(p.toLowerCase()))).join(' ');
    if (trimmed.includes(' ')) pushUnique(keys, trimmed, 'entity');
  }

  // Single tokens: compound (AriGraph, GPT-4) and capitalized proper nouns.
  for (const m of text.matchAll(/[A-Za-z][A-Za-z0-9._-]*[A-Za-z0-9]|[A-Za-z]/g)) {
    const token = m[0].replace(/[._-]+$/g, '');
    if (token.length < 2) continue;
    const lower = token.toLowerCase();
    if (STOP.has(lower)) continue;
    if (isCompoundToken(token)) {
      pushUnique(keys, token, 'entity');
      const split = splitCompound(token);
      if (split) pushUnique(keys, split, 'entity');
    } else if (/^[A-Z][a-z]{2,}$/.test(token) || /^[A-Z]{2,}$/.test(token)) {
      pushUnique(keys, token, 'entity');
    }
  }

  for (const tag of tags) pushUnique(keys, tag, 'entity');

  // Clause-local content-word bigrams and unigrams.
  const clauses = text.split(/[.!?;:\n]+/);
  const termBudget = new Set<string>();
  for (const clause of clauses) {
    const cw = contentWords(clause);
    for (let i = 0; i < cw.length; i++) {
      if (cw[i].length >= 3 && !GENERIC.has(cw[i])) termBudget.add(cw[i]);
      if (i + 1 < cw.length && cw[i].length >= 3 && cw[i + 1].length >= 3) {
        pushUnique(keys, `${cw[i]} ${cw[i + 1]}`, 'phrase');
      }
    }
    if (keys.size > MAX_KEYS_PER_MEMORY * 2) break;
  }
  for (const term of termBudget) pushUnique(keys, term, 'term');

  // Entities first, then phrases, then terms; bounded for write cost.
  return Array.from(keys.values())
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_KEYS_PER_MEMORY);
}

export interface ShellQuery {
  /** Discriminative content words of the query (stemmed). */
  terms: string[];
  /** Every address worth dereferencing. */
  keys: string[];
  /** True when the query names a specific thing (capitalized, compound, quoted). */
  hasNamedEntity: boolean;
}

/**
 * Normalize a recall query into addresses. Users type lowercase ("arigraph"),
 * so unlike extraction every content word is a candidate key.
 */
export function analyzeShellQuery(queryText: string): ShellQuery {
  const keys = new Set<string>();
  let hasNamedEntity = /["`“]/.test(queryText);

  for (const m of queryText.matchAll(/["`“]([^"`”\n]{2,60})["`”]/g)) keys.add(normalizeKey(m[1]));

  for (const m of queryText.matchAll(/[A-Za-z][A-Za-z0-9._-]*[A-Za-z0-9]/g)) {
    const token = m[0];
    if (isCompoundToken(token)) {
      hasNamedEntity = true;
      keys.add(normalizeKey(token));
      const split = splitCompound(token);
      if (split) keys.add(split);
    }
  }
  for (const m of queryText.matchAll(/\b([A-Z][A-Za-z0-9._-]*(?:\s+[A-Z][A-Za-z0-9._-]*){1,3})\b/g)) {
    const parts = m[1].split(/\s+/).filter((p, i) => !(i === 0 && STOP.has(p.toLowerCase())));
    if (parts.length >= 2) { keys.add(normalizeKey(parts.join(' '))); hasNamedEntity = true; }
  }
  // Mid-sentence capitalized words count as named. A sentence-initial one
  // only counts when it is not a function/question word.
  const caps = queryText.match(/\b[A-Z][a-z]{2,}\b/g) || [];
  if (caps.some((c) => !STOP.has(c.toLowerCase()) && !GENERIC.has(c.toLowerCase()))) hasNamedEntity = true;

  const terms: string[] = [];
  const seen = new Set<string>();
  for (const clause of queryText.split(/[.!?;:\n]+/)) {
    const cw = contentWords(clause);
    for (let i = 0; i < cw.length; i++) {
      const t = cw[i];
      if (t.length >= 3 && !GENERIC.has(t)) {
        keys.add(t);
        if (!seen.has(t)) { seen.add(t); terms.push(t); }
      }
      if (i + 1 < cw.length && cw[i].length >= 3 && cw[i + 1].length >= 3) keys.add(`${cw[i]} ${cw[i + 1]}`);
    }
  }

  return {
    terms,
    keys: Array.from(keys).filter((k) => k.length >= 2).slice(0, MAX_QUERY_KEYS),
    hasNamedEntity,
  };
}

// ───────────────────────── persistence ─────────────────────────

/** Replace the shell addresses of one memory. Idempotent; safe to retry. */
export async function indexMemoryShells(params: {
  userId: number;
  pointerId: string;
  content: string;
  tags?: string[];
}): Promise<number> {
  const shellKeys = extractShellKeys(params.content, params.tags || []);
  await query('DELETE FROM shell_index WHERE user_id = $1 AND pointer_id = $2', [params.userId, params.pointerId]);
  if (!shellKeys.length) return 0;
  await query(
    `INSERT INTO shell_index (user_id, shell_key, pointer_id, kind, weight)
     SELECT $1, k, $2, kd, w
     FROM unnest($3::text[], $4::text[], $5::float8[]) AS t(k, kd, w)
     ON CONFLICT (user_id, shell_key, pointer_id) DO UPDATE SET kind = EXCLUDED.kind, weight = EXCLUDED.weight`,
    [
      params.userId,
      params.pointerId,
      shellKeys.map((s) => computeBlindHash(s.key, params.userId)),
      shellKeys.map((s) => s.kind),
      shellKeys.map((s) => s.weight),
    ],
  );
  return shellKeys.length;
}

export async function removeMemoryShells(userId: number, pointerId: string): Promise<void> {
  await query('DELETE FROM shell_index WHERE user_id = $1 AND pointer_id = $2', [userId, pointerId]);
}

export interface ShellHit {
  pointerId: string;
  score: number;
  /** Fraction of the query's discriminative terms this memory covers. */
  coverage: number;
  matchedKeys: number;
  entityMatch: boolean;
}

export interface ShellLookup {
  hits: ShellHit[];
  analysis: ShellQuery;
  /** True when the top hit is strong enough to answer without Tier 1. */
  decisive: boolean;
}

/**
 * Dereference the query's addresses. One indexed query, no embedding.
 * Coverage is computed per memory against the query's own terms so a lone
 * generic match cannot masquerade as an answer.
 */
export async function lookupShells(userId: number, queryText: string, limit = 12): Promise<ShellLookup> {
  const analysis = analyzeShellQuery(queryText);
  if (!analysis.keys.length || !analysis.terms.length) return { hits: [], analysis, decisive: false };

  const hashToKey = new Map<string, string>();
  for (const key of analysis.keys) hashToKey.set(computeBlindHash(key, userId), key);

  const rows = await query<{ shell_key: string; pointer_id: string; kind: ShellKind; weight: number }>(
    `SELECT s.shell_key, s.pointer_id, s.kind, s.weight
     FROM shell_index s
     JOIN memories m ON m.pointer_id = s.pointer_id AND m.user_id = s.user_id AND m.is_active = true
     WHERE s.user_id = $1 AND s.shell_key = ANY($2::text[])
     LIMIT 2000`,
    [userId, Array.from(hashToKey.keys())],
  );

  // Document frequency per key to discount non-discriminative addresses.
  const df = new Map<string, number>();
  for (const r of rows.rows) df.set(r.shell_key, (df.get(r.shell_key) || 0) + 1);

  const perMemory = new Map<string, { score: number; covered: Set<string>; keys: Set<string>; entity: boolean }>();
  for (const r of rows.rows) {
    const key = hashToKey.get(r.shell_key);
    if (!key) continue;
    const frequency = df.get(r.shell_key) || 1;
    if (r.kind === 'term' && frequency > MAX_TERM_DF) continue;
    let entry = perMemory.get(r.pointer_id);
    if (!entry) {
      entry = { score: 0, covered: new Set(), keys: new Set(), entity: false };
      perMemory.set(r.pointer_id, entry);
    }
    entry.score += r.weight / Math.log2(2 + frequency);
    entry.keys.add(key);
    if (r.kind === 'entity') entry.entity = true;
    for (const part of key.split(' ')) {
      const sp = stem(part);
      if (analysis.terms.includes(sp)) entry.covered.add(sp);
      else if (analysis.terms.includes(part)) entry.covered.add(part);
    }
  }

  const hits: ShellHit[] = Array.from(perMemory.entries())
    .map(([pointerId, e]) => ({
      pointerId,
      score: e.score,
      coverage: e.covered.size / analysis.terms.length,
      matchedKeys: e.keys.size,
      entityMatch: e.entity,
    }))
    .filter((h) => h.coverage > 0)
    .sort((a, b) => (b.coverage - a.coverage) || (b.score - a.score))
    .slice(0, limit);

  const top = hits[0];
  const decisive = Boolean(top && top.coverage >= 0.99 && (top.entityMatch || analysis.terms.length >= 2));
  return { hits, analysis, decisive };
}
