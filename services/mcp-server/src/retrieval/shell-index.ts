/**
 * Tier 0: Memory Shells.
 *
 * A shell is a synchronous, deterministic lock-and-key address:
 *   blind_hash(normalized key) -> pointer_id[]
 *
 * Guarantee (the one this tier is built to keep, and tests enforce):
 *   a memory stored under a name is retrievable by that exact name,
 *   immediately, with no dependency on embeddings, queues or enrichment.
 *
 * Key tiers, from strongest to weakest:
 *   name    explicit names: tags, quoted spans, compounds (AriGraph, GPT-4),
 *           capitalized spans, declared aliases. Never capped, never
 *           discounted for frequency.
 *   phrase  adjacent content-word pairs inside a clause.
 *   term    significant content words. Capped and frequency-discounted.
 *
 * Privacy: keys are stored as HMAC blind hashes, never plaintext.
 */
import { query } from '../db/client.js';
import { computeBlindHash } from '../lib/blind-index.js';
import { decrypt } from '../lib/encryption.js';

export type ShellKind = 'name' | 'phrase' | 'term';

export interface ShellKey {
  key: string;
  kind: ShellKind;
  weight: number;
}

export interface AliasPair {
  alias: string;
  canonical: string;
}

const KIND_WEIGHT: Record<ShellKind, number> = { name: 1.0, phrase: 0.6, term: 0.3 };
const MAX_NAME_KEYS = 200;
const MAX_SOFT_KEYS = 100;
const MAX_QUERY_KEYS = 60;
const MAX_INDEXED_CHARS = 50_000;
/** Terms that point at more memories than this are not discriminative. */
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

/**
 * Intent words describe HOW the user is asking, not WHAT. "jev related" asks
 * for everything about Jev; "related" must not become a term that every
 * memory has to cover.
 */
const INTENT_RAW = [
  'related', 'relate', 'relates', 'relating', 'regarding', 'concerning', 'associated',
  'everything', 'anything', 'info', 'overview',
];
// Query terms are stemmed before comparison, so match both forms.
const INTENT = new Set<string>([...INTENT_RAW, ...INTENT_RAW.map((w) => stem(w))]);

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

export function stem(word: string): string {
  if (word.length <= 4) return word;
  if (word.endsWith('ies') && word.length > 5) return `${word.slice(0, -3)}y`;
  if (word.endsWith('ing') && word.length > 6) return word.slice(0, -3);
  if (word.endsWith('ed') && word.length > 5) return word.slice(0, -2);
  if (word.endsWith('es') && word.length > 5) return word.slice(0, -2);
  if (word.endsWith('s') && word.length > 4 && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

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
  return /[a-z][A-Z]/.test(token)
    || /[A-Z]{2,}[a-z]/.test(token)
    || /[A-Za-z][._-][A-Za-z0-9]/.test(token)
    || (/[A-Za-z]/.test(token) && /\d/.test(token));
}

// ───────────────────────── alias extraction ─────────────────────────

/**
 * Declared aliases only. We never guess synonyms; we bind names the author
 * explicitly equated: "X (aka Y)", "X, also known as Y", "X a.k.a. Y",
 * "Y is short for X", and "Long Form (ACR)".
 */
export function extractAliasPairs(content: string): AliasPair[] {
  const pairs = new Map<string, AliasPair>();
  const add = (a: string, b: string) => {
    const alias = normalizeKey(a);
    const canonical = normalizeKey(b);
    if (!alias || !canonical || alias === canonical || alias.length < 2 || canonical.length < 2) return;
    if (alias.split(' ').length > 5 || canonical.split(' ').length > 5) return;
    pairs.set(`${alias}|${canonical}`, { alias, canonical });
  };
  const name = '([A-Za-z0-9][A-Za-z0-9._-]*(?:\\s+[A-Za-z0-9][A-Za-z0-9._-]*){0,3})';
  const text = content.slice(0, MAX_INDEXED_CHARS);

  for (const m of text.matchAll(new RegExp(`${name}\\s*[,(]?\\s*(?:aka|a\\.k\\.a\\.|also known as|also called|formerly)\\s+${name}\\s*\\)?`, 'gi'))) {
    add(m[1], m[2]);
  }
  for (const m of text.matchAll(new RegExp(`${name}\\s+is\\s+(?:short for|an abbreviation of|abbreviated from)\\s+${name}`, 'gi'))) {
    add(m[1], m[2]);
  }
  // "Large Language Model (LLM)": acronym must match the initials.
  for (const m of text.matchAll(/\b([A-Z][A-Za-z]+(?:\s+[A-Za-z]+){1,5})\s+\(([A-Z][A-Za-z0-9]{1,9})\)/g)) {
    const initials = m[1].split(/\s+/).filter((w) => !STOP.has(w.toLowerCase())).map((w) => w[0].toUpperCase()).join('');
    if (initials === m[2].toUpperCase()) add(m[1], m[2]);
  }
  return Array.from(pairs.values()).slice(0, 20);
}

// ───────────────────────── extraction ─────────────────────────

function firstSentence(text: string): string {
  const m = text.match(/^[\s\S]{0,300}?(?:[.!?](?:\s|$)|\n|$)/);
  return (m ? m[0] : text.slice(0, 200)).toLowerCase();
}

/**
 * Extract shell keys from a memory. Pure and fast (single pass, no I/O).
 * Weights encode aboutness: a key in the first sentence or a tag, or one that
 * recurs, describes what the memory is about rather than what it mentions.
 */
export function extractShellKeys(content: string, tags: string[] = []): ShellKey[] {
  const text = content.slice(0, MAX_INDEXED_CHARS);
  const names = new Map<string, number>(); // key -> occurrences
  const soft = new Map<string, { kind: ShellKind; count: number }>();
  const tagKeys = new Set<string>();

  const addName = (raw: string) => {
    const key = normalizeKey(raw);
    if (key.length < 2) return;
    names.set(key, (names.get(key) || 0) + 1);
  };
  const addSoft = (key: string, kind: ShellKind) => {
    if (key.length < 2) return;
    const cur = soft.get(key);
    soft.set(key, { kind, count: (cur?.count || 0) + 1 });
  };

  for (const m of text.matchAll(/["`“]([^"`”\n]{2,60})["`”]/g)) addName(m[1]);

  for (const m of text.matchAll(/\b([A-Z][A-Za-z0-9._-]*(?:\s+[A-Z][A-Za-z0-9._-]*){1,3})\b/g)) {
    const parts = m[1].split(/\s+/);
    if (parts.every((p) => STOP.has(p.toLowerCase()))) continue;
    const trimmed = parts.filter((p, i) => !(i === 0 && STOP.has(p.toLowerCase()))).join(' ');
    if (trimmed.includes(' ')) addName(trimmed);
  }

  for (const m of text.matchAll(/[A-Za-z][A-Za-z0-9._-]*[A-Za-z0-9]|[A-Za-z]/g)) {
    const token = m[0].replace(/[._-]+$/g, '');
    if (token.length < 2) continue;
    if (STOP.has(token.toLowerCase())) continue;
    if (isCompoundToken(token)) {
      addName(token);
      const split = splitCompound(token);
      if (split) addName(split);
    } else if (/^[A-Z][a-z]{2,}$/.test(token) || /^[A-Z]{2,}$/.test(token)) {
      addName(token);
    }
  }

  for (const tag of tags) {
    const key = normalizeKey(tag);
    if (key.length >= 2) { addName(tag); tagKeys.add(key); }
  }

  for (const clause of text.split(/[.!?;:\n]+/)) {
    const cw = contentWords(clause);
    for (let i = 0; i < cw.length; i++) {
      if (cw[i].length >= 3 && !GENERIC.has(cw[i])) addSoft(cw[i], 'term');
      if (i + 1 < cw.length && cw[i].length >= 3 && cw[i + 1].length >= 3) addSoft(`${cw[i]} ${cw[i + 1]}`, 'phrase');
    }
  }

  const head = firstSentence(text);
  const headWords = new Set(contentWords(head));
  const headNames = normalizeKey(head);
  const aboutness = (key: string, count: number, inTag: boolean, isName: boolean): number => {
    const inHead = isName
      ? (` ${headNames} `).includes(` ${key} `)
      : key.split(' ').every((p) => headWords.has(p));
    // Definitional cue: "<name> is/are/means/refers to ..." marks the memory
    // that defines the thing, as opposed to one that merely mentions it.
    const defines = isName && new RegExp(`(?:^| )${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (?:is|are|was|were|means|refers to|stands for)\\b`).test(headNames);
    return 1 + (inHead ? 0.5 : 0) + (inTag ? 0.5 : 0) + (defines ? 0.75 : 0) + 0.25 * Math.min(3, Math.log2(1 + count));
  };

  const out: ShellKey[] = [];
  for (const [key, count] of names) {
    out.push({ key, kind: 'name', weight: KIND_WEIGHT.name * aboutness(key, count, tagKeys.has(key), true) });
  }
  out.sort((a, b) => b.weight - a.weight);
  const nameKeys = new Set(out.map((o) => o.key));
  const named = out.slice(0, MAX_NAME_KEYS);

  const softKeys: ShellKey[] = [];
  for (const [key, v] of soft) {
    if (nameKeys.has(key)) continue; // a name already addresses it
    softKeys.push({ key, kind: v.kind, weight: KIND_WEIGHT[v.kind] * aboutness(key, v.count, false, false) });
  }
  softKeys.sort((a, b) => b.weight - a.weight);

  // Alias targets are names too: "ARC (Adaptive Retrieval Core)" must resolve
  // by either form. Bounded by the alias extractor.
  const aliasNames: ShellKey[] = [];
  for (const pair of extractAliasPairs(text)) {
    for (const k of [pair.alias, pair.canonical]) {
      if (!nameKeys.has(k)) { nameKeys.add(k); aliasNames.push({ key: k, kind: 'name', weight: KIND_WEIGHT.name }); }
    }
  }

  return [...named, ...aliasNames, ...softKeys.slice(0, MAX_SOFT_KEYS)];
}

// ───────────────────────── query analysis ─────────────────────────

export interface ShellQuery {
  /** Discriminative content words of the query (stemmed). */
  terms: string[];
  /** Every address worth dereferencing. */
  keys: string[];
  /** True when the query names a specific thing (capitalized, compound, quoted). */
  hasNamedEntity: boolean;
  /** True when the user asked for everything around a subject ("jev related"). */
  broad: boolean;
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
  const caps = queryText.match(/\b[A-Z][a-z]{2,}\b/g) || [];
  if (caps.some((c) => !STOP.has(c.toLowerCase()) && !GENERIC.has(c.toLowerCase()))) hasNamedEntity = true;

  const terms: string[] = [];
  const seen = new Set<string>();
  for (const clause of queryText.split(/[.!?;:\n]+/)) {
    // Raw, unstemmed words address single-word NAMES ("Helios" is stored as
    // the name "helios", not the stemmed term "helio").
    for (const w of words(clause)) {
      if (w.length >= 3 && !STOP.has(w) && !GENERIC.has(w) && !INTENT.has(w)) keys.add(w);
    }
    const cw = contentWords(clause);
    for (let i = 0; i < cw.length; i++) {
      const t = cw[i];
      if (t.length >= 3 && !GENERIC.has(t) && !INTENT.has(t)) {
        keys.add(t);
        if (!seen.has(t)) { seen.add(t); terms.push(t); }
      }
      if (i + 1 < cw.length && cw[i].length >= 3 && cw[i + 1].length >= 3
        && !INTENT.has(cw[i]) && !INTENT.has(cw[i + 1])) keys.add(`${cw[i]} ${cw[i + 1]}`);
    }
  }

  const broad = words(queryText).some((w) => INTENT.has(w));
  return {
    terms,
    keys: Array.from(keys).filter((k) => k.length >= 2).slice(0, MAX_QUERY_KEYS),
    hasNamedEntity,
    broad,
  };
}

// ───────────────────────── persistence ─────────────────────────

export interface ShellRows {
  keys: string[];
  kinds: string[];
  weights: number[];
  aliasFrom: string[];
  aliasTo: string[];
}

/** Hashed, ready-to-insert rows. Pure; used by both store and update paths. */
export function buildShellRows(userId: number, content: string, tags: string[] = []): ShellRows {
  const shellKeys = extractShellKeys(content, tags);
  const aliasFrom: string[] = [];
  const aliasTo: string[] = [];
  for (const pair of extractAliasPairs(content)) {
    // Symmetric: either form resolves to the other.
    aliasFrom.push(computeBlindHash(pair.alias, userId), computeBlindHash(pair.canonical, userId));
    aliasTo.push(computeBlindHash(pair.canonical, userId), computeBlindHash(pair.alias, userId));
  }
  return {
    keys: shellKeys.map((s) => computeBlindHash(s.key, userId)),
    kinds: shellKeys.map((s) => s.kind),
    weights: shellKeys.map((s) => s.weight),
    aliasFrom,
    aliasTo,
  };
}

/**
 * SQL fragment pair used inside a single atomic statement. The memory insert
 * and its shell rows commit or fail together, in every runtime (a single
 * statement is atomic even where multi-statement transactions are not
 * available, such as short-lived Worker connections).
 */
export const SHELL_INSERT_CTES = (userParam: number, pointerParam: number, base: number) => `
  s AS (
    INSERT INTO shell_index (user_id, shell_key, pointer_id, kind, weight)
    SELECT $${userParam}::int, k, $${pointerParam}::text, kd, w
    FROM unnest($${base}::text[], $${base + 1}::text[], $${base + 2}::float8[]) AS t(k, kd, w)
    ON CONFLICT (user_id, shell_key, pointer_id) DO UPDATE SET kind = EXCLUDED.kind, weight = EXCLUDED.weight
    RETURNING 1
  ),
  a AS (
    INSERT INTO shell_aliases (user_id, alias_key, canonical_key)
    SELECT $${userParam}::int, af, at
    FROM unnest($${base + 3}::text[], $${base + 4}::text[]) AS t(af, at)
    ON CONFLICT DO NOTHING
    RETURNING 1
  )`;

/** Replace the shell addresses of one memory in one atomic statement. */
export async function indexMemoryShells(params: {
  userId: number;
  pointerId: string;
  content: string;
  tags?: string[];
}): Promise<number> {
  const rows = buildShellRows(params.userId, params.content, params.tags || []);
  await query(
    `WITH del AS (
       DELETE FROM shell_index
       WHERE user_id = $1 AND pointer_id = $2 AND shell_key <> ALL($3::text[])
       RETURNING 1
     ),
     ${SHELL_INSERT_CTES(1, 2, 3)}
     SELECT (SELECT count(*) FROM del) AS removed, (SELECT count(*) FROM s) AS added, (SELECT count(*) FROM a) AS aliases`,
    [params.userId, params.pointerId, rows.keys, rows.kinds, rows.weights, rows.aliasFrom, rows.aliasTo],
  );
  return rows.keys.length;
}

export async function removeMemoryShells(userId: number, pointerId: string): Promise<void> {
  await query('DELETE FROM shell_index WHERE user_id = $1 AND pointer_id = $2', [userId, pointerId]);
}

/** Bind an alias to a canonical name (symmetric). For agents and the dashboard. */
export async function addShellAlias(userId: number, alias: string, canonical: string): Promise<void> {
  const a = computeBlindHash(alias, userId);
  const c = computeBlindHash(canonical, userId);
  if (a === c) return;
  await query(
    `INSERT INTO shell_aliases (user_id, alias_key, canonical_key)
     VALUES ($1, $2, $3), ($1, $3, $2)
     ON CONFLICT DO NOTHING`,
    [userId, a, c],
  );
}

// ───────────────────────── lookup ─────────────────────────

export interface ShellHit {
  pointerId: string;
  /** Rank score: IDF-weighted coverage plus a bounded aboutness bonus. */
  score: number;
  /** Unweighted fraction of query terms this memory covers. */
  coverage: number;
  /** IDF-weighted fraction: a rare term counts for more than a common one. */
  weightedCoverage: number;
  matchedKeys: number;
  nameMatch: boolean;
  /** True when the memory covers the query's rarest (most discriminative) term. */
  coversAnchor: boolean;
  via: 'direct' | 'related';
}

export interface ShellLookup {
  hits: ShellHit[];
  analysis: ShellQuery;
  /** True when the top hit is strong enough to answer without Tier 1. */
  decisive: boolean;
  /** The rarest query term, the one that best identifies what is being asked. */
  anchorTerm?: string;
  ms: number;
}

/** Keys shared by more memories than this are only used to score existing candidates. */
const DF_FETCH_CAP = 400;

const idf = (n: number, df: number): number => Math.log(1 + (n - df + 0.5) / (df + 0.5));

/**
 * Dereference the query's addresses. A handful of indexed queries, no embedding.
 *
 * Ranking is IDF-weighted so a rare keyword outweighs several common ones:
 * when "coding" is in 200 memories and "Orion" in 3, the memory that has
 * Orion beats a memory that has coding plus another common word. Memories
 * that cover the anchor (rarest term) are kept even when they miss the
 * common terms, so the accurate one-keyword memory is never silently dropped.
 */
export async function lookupShells(userId: number, queryText: string, limit = 20): Promise<ShellLookup> {
  const started = performance.now();
  const analysis = analyzeShellQuery(queryText);
  const empty = (): ShellLookup => ({ hits: [], analysis, decisive: false, ms: Math.round(performance.now() - started) });
  if (!analysis.keys.length || !analysis.terms.length) return empty();

  const hashToKey = new Map<string, string>();
  for (const key of analysis.keys) hashToKey.set(computeBlindHash(key, userId), key);

  const aliasRows = await query<{ alias_key: string; canonical_key: string }>(
    'SELECT alias_key, canonical_key FROM shell_aliases WHERE user_id = $1 AND alias_key = ANY($2::text[])',
    [userId, Array.from(hashToKey.keys())],
  );
  for (const r of aliasRows.rows) {
    const source = hashToKey.get(r.alias_key);
    if (source && !hashToKey.has(r.canonical_key)) hashToKey.set(r.canonical_key, source);
  }
  const allHashes = Array.from(hashToKey.keys());

  const [dfRows, totalRow] = await Promise.all([
    query<{ shell_key: string; df: number }>(
      `SELECT s.shell_key, count(*)::int AS df
       FROM shell_index s
       JOIN memories m ON m.pointer_id = s.pointer_id AND m.user_id = s.user_id AND m.is_active = true
       WHERE s.user_id = $1 AND s.shell_key = ANY($2::text[])
       GROUP BY s.shell_key`,
      [userId, allHashes],
    ),
    query<{ n: number }>('SELECT count(*)::int AS n FROM memories WHERE user_id = $1 AND is_active = true', [userId]),
  ]);
  const total = Math.max(1, totalRow.rows[0]?.n ?? 1);
  const df = new Map(dfRows.rows.map((r) => [r.shell_key, r.df]));
  if (df.size === 0) return empty();

  const lowHashes = allHashes.filter((h) => (df.get(h) ?? 0) > 0 && (df.get(h) ?? 0) <= DF_FETCH_CAP);
  const highHashes = allHashes.filter((h) => (df.get(h) ?? 0) > DF_FETCH_CAP);

  type Row = { shell_key: string; pointer_id: string; kind: ShellKind; weight: number };
  const fetchRows = (hashes: string[], pointers?: string[]) => query<Row>(
    `SELECT s.shell_key, s.pointer_id, s.kind, s.weight
     FROM shell_index s
     JOIN memories m ON m.pointer_id = s.pointer_id AND m.user_id = s.user_id AND m.is_active = true
     WHERE s.user_id = $1 AND s.shell_key = ANY($2::text[])
       ${pointers ? 'AND s.pointer_id = ANY($3::text[])' : ''}
     ORDER BY (s.kind = 'name') DESC, s.weight DESC
     LIMIT 20000`,
    pointers ? [userId, hashes, pointers] : [userId, hashes],
  );

  let rows: Row[] = lowHashes.length ? (await fetchRows(lowHashes)).rows : [];
  if (highHashes.length && rows.length) {
    // Very common keys never create candidates; they only score memories a
    // more specific key already found.
    const candidates = Array.from(new Set(rows.map((r) => r.pointer_id)));
    rows = rows.concat((await fetchRows(highHashes, candidates)).rows);
  }
  if (!rows.length) return empty();

  // Per-term IDF from the most specific key that covers the term.
  const termDf = new Map<string, number>();
  for (const [hash, key] of hashToKey) {
    const d = df.get(hash);
    if (!d) continue;
    for (const part of key.split(' ')) {
      const t = analysis.terms.includes(stem(part)) ? stem(part) : (analysis.terms.includes(part) ? part : null);
      if (!t) continue;
      termDf.set(t, Math.min(termDf.get(t) ?? Infinity, d));
    }
  }
  const termIdf = new Map<string, number>();
  for (const t of analysis.terms) termIdf.set(t, idf(total, termDf.get(t) ?? 0));
  const idfSum = analysis.terms.reduce((sum, t) => sum + (termIdf.get(t) || 0), 0);
  // A term absent from the index entirely is the rarest term of all.
  let anchorTerm: string | undefined;
  let anchorIdf = -1;
  for (const t of analysis.terms) {
    if ((termDf.get(t) ?? 0) === 0) continue; // unindexed: cannot anchor a hit
    const v = termIdf.get(t) || 0;
    if (v > anchorIdf) { anchorIdf = v; anchorTerm = t; }
  }

  const perMemory = new Map<string, { score: number; covered: Set<string>; keys: Set<string>; name: boolean }>();
  for (const r of rows) {
    const key = hashToKey.get(r.shell_key);
    if (!key) continue;
    let entry = perMemory.get(r.pointer_id);
    if (!entry) {
      entry = { score: 0, covered: new Set(), keys: new Set(), name: false };
      perMemory.set(r.pointer_id, entry);
    }
    const frequency = df.get(r.shell_key) || 1;
    entry.score += r.weight * idf(total, frequency);
    entry.keys.add(key);
    if (r.kind === 'name') entry.name = true;
    for (const part of key.split(' ')) {
      const sp = stem(part);
      if (analysis.terms.includes(sp)) entry.covered.add(sp);
      else if (analysis.terms.includes(part)) entry.covered.add(part);
    }
  }

  const maxScore = Math.max(1e-9, ...Array.from(perMemory.values(), (e) => e.score));
  const candidatesOut: ShellHit[] = [];
  for (const [pointerId, e] of perMemory) {
    if (!e.covered.size) continue;
    const covered = Array.from(e.covered);
    const weighted = idfSum > 0
      ? covered.reduce((sum, t) => sum + (termIdf.get(t) || 0), 0) / idfSum
      : covered.length / analysis.terms.length;
    const coversAnchor = anchorTerm ? e.covered.has(anchorTerm) : false;
    // Keep full matches, anchor holders with real support, and strong partials.
    if (!(weighted >= 0.99 || (coversAnchor && weighted >= 0.3) || weighted >= 0.6)) continue;
    candidatesOut.push({
      pointerId,
      score: weighted + 0.35 * Math.min(1, e.score / maxScore),
      coverage: covered.length / analysis.terms.length,
      weightedCoverage: weighted,
      matchedKeys: e.keys.size,
      nameMatch: e.name,
      coversAnchor,
      via: 'direct',
    });
  }
  // A memory that covers every query term outranks one that does not, then
  // IDF-weighted score decides. Partial anchor holders still follow.
  const full = (h: ShellHit) => (h.coverage >= 0.999 ? 1 : 0);
  const hits = candidatesOut.sort((a, b) => (full(b) - full(a)) || (b.score - a.score)).slice(0, limit);

  const top = hits[0];
  const decisive = Boolean(top && top.weightedCoverage >= 0.99 && (top.nameMatch || analysis.terms.length >= 2));
  return { hits, analysis, decisive, anchorTerm, ms: Math.round(performance.now() - started) };
}

/**
 * Associative expansion over the shell graph (memories are linked by the
 * rare names they share). A synchronous, LLM-free cousin of HippoRAG's
 * personalized PageRank step: seeds spread activation through rare shared
 * names, weighted by IDF, so "jev related" also surfaces the AriGraph
 * memory that never says "Jev" but shares a rare name with a Jev memory.
 */
export async function expandRelatedShells(
  userId: number,
  seedPointers: string[],
  exclude: string[],
  limit = 5,
): Promise<ShellHit[]> {
  if (!seedPointers.length) return [];
  const totalRow = await query<{ n: number }>('SELECT count(*)::int AS n FROM memories WHERE user_id = $1 AND is_active = true', [userId]);
  const total = Math.max(2, totalRow.rows[0]?.n ?? 2);
  const related = await query<{ pointer_id: string; activation: number; shared: number }>(
      `WITH seed_names AS (
         SELECT DISTINCT shell_key FROM shell_index
         WHERE user_id = $1 AND kind = 'name' AND pointer_id = ANY($2::text[])
       ),
       name_df AS (
         SELECT s.shell_key, count(*)::int AS df
         FROM shell_index s JOIN seed_names n ON n.shell_key = s.shell_key
         WHERE s.user_id = $1 AND s.kind = 'name'
         GROUP BY s.shell_key
         HAVING count(*) BETWEEN 2 AND 30
       )
       SELECT s.pointer_id,
              sum(ln(1 + $4::float8 / d.df))::float8 AS activation,
              count(*)::int AS shared
       FROM shell_index s
       JOIN name_df d ON d.shell_key = s.shell_key
       JOIN memories m ON m.pointer_id = s.pointer_id AND m.user_id = s.user_id AND m.is_active = true
       WHERE s.user_id = $1 AND s.kind = 'name' AND NOT (s.pointer_id = ANY($3::text[]))
       GROUP BY s.pointer_id
       ORDER BY activation DESC
       LIMIT $5`,
      [userId, seedPointers, exclude, total, limit],
  );
  const max = Math.max(1e-9, ...related.rows.map((r) => r.activation));
  return related.rows.map((r) => ({
    pointerId: r.pointer_id,
    score: 0.2 * (r.activation / max),
    coverage: 0,
    weightedCoverage: 0,
    matchedKeys: r.shared,
    nameMatch: true,
    coversAnchor: false,
    via: 'related' as const,
  }));
}

// ───────────────────────── repair ─────────────────────────

/**
 * Re-index active memories that have no shell rows (stored before the index
 * existed, or whose write was lost). Idempotent. Returns counts.
 */
export async function repairShellIndex(options: { userId?: number; limit?: number } = {}): Promise<{ scanned: number; repaired: number; failed: number }> {
  const limit = options.limit ?? 500;
  const missing = await query<any>(
    `SELECT m.user_id, m.pointer_id, m.tags, m.content_encrypted, m.content_iv, m.content_tag
     FROM memories m
     WHERE m.is_active = true
       AND ($1::int IS NULL OR m.user_id = $1)
       AND NOT EXISTS (SELECT 1 FROM shell_index s WHERE s.user_id = m.user_id AND s.pointer_id = m.pointer_id)
     ORDER BY m.id ASC
     LIMIT $2`,
    [options.userId ?? null, limit],
  );
  let repaired = 0;
  let failed = 0;
  for (const row of missing.rows) {
    try {
      const content = decrypt({ encrypted: row.content_encrypted, iv: row.content_iv, tag: row.content_tag });
      await indexMemoryShells({ userId: row.user_id, pointerId: row.pointer_id, content, tags: row.tags || [] });
      repaired++;
    } catch (error) {
      failed++;
      console.warn(JSON.stringify({ event: 'shell_repair_failed', pointerId: row.pointer_id, error: error instanceof Error ? error.message.slice(0, 200) : String(error) }));
    }
  }
  return { scanned: missing.rows.length, repaired, failed };
}
