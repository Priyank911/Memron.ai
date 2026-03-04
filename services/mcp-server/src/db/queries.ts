/**
 * Database Queries — All SQL operations for the MCP server.
 *
 * Organized by domain:
 * - Memory CRUD
 * - OAuth client management
 * - Auth code lifecycle
 * - Refresh token management
 * - Pending auth requests
 * - Forensic snapshots
 * - User / profile lookups
 */
import { query, transaction } from './client.js';

// ─────────────────────────────────────────────────────────────
// Memory Operations
// ─────────────────────────────────────────────────────────────

export interface MemoryRow {
  id: number;
  pointer_id: string;
  user_id: number;
  org_id: number | null;
  bucket: string;
  title: string;
  content_encrypted: Buffer;
  content_iv: Buffer;
  content_tag: Buffer;
  content_hash: string;
  tags: string[];
  token_count: number;
  original_tokens: number;
  metadata: Record<string, unknown>;
  is_active: boolean;
  api_key_id: number | null;
  sub_path: string;
  importance: number;
  access_count: number;
  last_accessed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export async function insertMemory(params: {
  pointerId: string;
  userId: number;
  orgId?: number;
  bucket: string;
  title: string;
  contentEncrypted: Buffer;
  contentIv: Buffer;
  contentTag: Buffer;
  contentHash: string;
  tags: string[];
  tokenCount: number;
  originalTokens: number;
  metadata?: Record<string, unknown>;
  apiKeyId?: number;
  subPath?: string;
  importance?: number;
}): Promise<MemoryRow> {
  const result = await query<MemoryRow>(
    `INSERT INTO memories (
      pointer_id, user_id, org_id, bucket, title,
      content_encrypted, content_iv, content_tag, content_hash,
      tags, token_count, original_tokens, metadata,
      api_key_id, sub_path, importance
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    RETURNING *`,
    [
      params.pointerId,
      params.userId,
      params.orgId ?? null,
      params.bucket,
      params.title,
      params.contentEncrypted,
      params.contentIv,
      params.contentTag,
      params.contentHash,
      params.tags,
      params.tokenCount,
      params.originalTokens,
      JSON.stringify(params.metadata ?? {}),
      params.apiKeyId ?? null,
      params.subPath ?? '',
      params.importance ?? 0.5,
    ],
  );

  // Increment bucket memory_count (non-blocking, best-effort)
  query(
    `UPDATE buckets SET memory_count = memory_count + 1, updated_at = NOW()
     WHERE user_id = $1 AND slug = $2`,
    [params.userId, params.bucket],
  ).catch(() => { /* bucket table may not exist yet */ });

  return result.rows[0];
}

export async function getMemoryByPointer(pointerId: string, userId: number): Promise<MemoryRow | null> {
  const result = await query<MemoryRow>(
    `SELECT * FROM memories WHERE pointer_id = $1 AND user_id = $2 AND is_active = true`,
    [pointerId, userId],
  );
  return result.rows[0] ?? null;
}

export async function searchMemories(params: {
  userId: number;
  queryText?: string;
  bucket?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}): Promise<MemoryRow[]> {
  const conditions: string[] = ['user_id = $1', 'is_active = true'];
  const values: unknown[] = [params.userId];
  let paramIndex = 2;

  if (params.bucket) {
    conditions.push(`bucket = $${paramIndex}`);
    values.push(params.bucket);
    paramIndex++;
  }

  if (params.tags && params.tags.length > 0) {
    conditions.push(`tags && $${paramIndex}`);
    values.push(params.tags);
    paramIndex++;
  }

  if (params.queryText) {
    conditions.push(
      `(to_tsvector('english', title) @@ plainto_tsquery('english', $${paramIndex})
        OR title ILIKE '%' || $${paramIndex} || '%')`,
    );
    values.push(params.queryText);
    paramIndex++;
  }

  const limit = Math.min(params.limit ?? 20, 50);
  const offset = params.offset ?? 0;

  const result = await query<MemoryRow>(
    `SELECT * FROM memories
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT ${limit} OFFSET ${offset}`,
    values,
  );
  return result.rows;
}

export async function updateMemory(params: {
  pointerId: string;
  userId: number;
  title?: string;
  contentEncrypted?: Buffer;
  contentIv?: Buffer;
  contentTag?: Buffer;
  contentHash?: string;
  tags?: string[];
  bucket?: string;
  originalTokens?: number;
  tokenCount?: number;
  metadata?: Record<string, unknown>;
}): Promise<MemoryRow | null> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  const addSet = (col: string, val: unknown) => {
    if (val !== undefined) {
      sets.push(`${col} = $${paramIndex}`);
      values.push(val);
      paramIndex++;
    }
  };

  addSet('title', params.title);
  addSet('content_encrypted', params.contentEncrypted);
  addSet('content_iv', params.contentIv);
  addSet('content_tag', params.contentTag);
  addSet('content_hash', params.contentHash);
  addSet('tags', params.tags);
  addSet('bucket', params.bucket);
  addSet('original_tokens', params.originalTokens);
  addSet('token_count', params.tokenCount);
  if (params.metadata !== undefined) {
    sets.push(`metadata = $${paramIndex}`);
    values.push(JSON.stringify(params.metadata));
    paramIndex++;
  }

  if (sets.length === 0) return null;

  values.push(params.pointerId, params.userId);
  const result = await query<MemoryRow>(
    `UPDATE memories SET ${sets.join(', ')}
     WHERE pointer_id = $${paramIndex} AND user_id = $${paramIndex + 1} AND is_active = true
     RETURNING *`,
    values,
  );
  return result.rows[0] ?? null;
}

export async function softDeleteMemory(pointerId: string, userId: number): Promise<boolean> {
  const result = await query(
    `UPDATE memories SET is_active = false, updated_at = NOW()
     WHERE pointer_id = $1 AND user_id = $2 AND is_active = true`,
    [pointerId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function countMemories(userId: number): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) as count FROM memories WHERE user_id = $1 AND is_active = true`,
    [userId],
  );
  return parseInt(result.rows[0].count, 10);
}

export async function getMemoryStats(userId: number): Promise<{
  totalMemories: number;
  totalOriginalTokens: number;
  totalPointerTokens: number;
  bucketCounts: Record<string, number>;
}> {
  const statsResult = await query<{
    total: string;
    total_original: string;
    total_pointer: string;
  }>(
    `SELECT
       COUNT(*) as total,
       COALESCE(SUM(original_tokens), 0) as total_original,
       COALESCE(SUM(token_count), 0) as total_pointer
     FROM memories WHERE user_id = $1 AND is_active = true`,
    [userId],
  );

  const bucketResult = await query<{ bucket: string; count: string }>(
    `SELECT bucket, COUNT(*) as count
     FROM memories WHERE user_id = $1 AND is_active = true
     GROUP BY bucket ORDER BY count DESC`,
    [userId],
  );

  const bucketCounts: Record<string, number> = {};
  for (const row of bucketResult.rows) {
    bucketCounts[row.bucket] = parseInt(row.count, 10);
  }

  const stats = statsResult.rows[0];
  return {
    totalMemories: parseInt(stats.total, 10),
    totalOriginalTokens: parseInt(stats.total_original, 10),
    totalPointerTokens: parseInt(stats.total_pointer, 10),
    bucketCounts,
  };
}

/**
 * List all buckets for a user (from the buckets table).
 * Falls back to deriving buckets from the memories table if the buckets table
 * doesn't exist yet.
 */
export async function listBuckets(userId: number): Promise<{
  slug: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  memoryCount: number;
}[]> {
  try {
    const result = await query(
      `SELECT b.slug, b.name, b.description, b.is_default,
              (SELECT count(*) FROM memories m WHERE m.bucket = b.slug AND m.user_id = b.user_id AND m.is_active = true) as memory_count
       FROM buckets b
       WHERE b.user_id = $1 AND b.is_active = true
       ORDER BY b.is_default DESC, b.created_at ASC`,
      [userId],
    );
    return result.rows.map((r: any) => ({
      slug: r.slug,
      name: r.name,
      description: r.description,
      isDefault: r.is_default,
      memoryCount: parseInt(r.memory_count, 10),
    }));
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('does not exist')) {
      // Fallback: derive buckets from memory table
      const fallback = await query(
        `SELECT bucket as slug, COUNT(*) as count FROM memories
         WHERE user_id = $1 AND is_active = true
         GROUP BY bucket ORDER BY count DESC`,
        [userId],
      );
      return fallback.rows.map((r: any) => ({
        slug: r.slug,
        name: r.slug.charAt(0).toUpperCase() + r.slug.slice(1),
        description: null,
        isDefault: r.slug === 'main' || r.slug === 'conversation',
        memoryCount: parseInt(r.count, 10),
      }));
    }
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────
// Bucket Operations
// ─────────────────────────────────────────────────────────────

/**
 * Get a single bucket by slug for a given user.
 */
export async function getBucketBySlug(userId: number, slug: string): Promise<{
  id: number;
  bucketId: string;
  slug: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  memoryCount: number;
} | null> {
  try {
    const result = await query(
      `SELECT id, bucket_id, slug, name, description, is_default, memory_count
       FROM buckets
       WHERE user_id = $1 AND slug = $2 AND is_active = true`,
      [userId, slug],
    );
    if (!result.rows[0]) return null;
    const r = result.rows[0] as any;
    return {
      id: r.id,
      bucketId: r.bucket_id,
      slug: r.slug,
      name: r.name,
      description: r.description,
      isDefault: r.is_default,
      memoryCount: parseInt(r.memory_count, 10),
    };
  } catch {
    return null;
  }
}

/**
 * Create a new sub-bucket for a user.
 * Enforces a maximum of 50 buckets per user.
 */
export async function createBucket(params: {
  userId: number;
  orgId?: number;
  name: string;
  slug: string;
  description?: string;
  parentBucket?: string;
}): Promise<{
  id: number;
  bucketId: string;
  slug: string;
  name: string;
  description: string | null;
  isDefault: boolean;
}> {
  // Check bucket limit
  const countResult = await query(
    `SELECT COUNT(*) as cnt FROM buckets WHERE user_id = $1 AND is_active = true`,
    [params.userId],
  );
  const count = parseInt((countResult.rows[0] as any).cnt, 10);
  if (count >= 50) {
    throw new Error('Bucket limit reached (max 50). Delete unused buckets first.');
  }

  const result = await query(
    `INSERT INTO buckets (user_id, org_id, name, slug, description, is_default)
     VALUES ($1, $2, $3, $4, $5, false)
     ON CONFLICT (user_id, slug) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       is_active = true,
       updated_at = NOW()
     RETURNING id, bucket_id, slug, name, description, is_default`,
    [
      params.userId,
      params.orgId ?? null,
      params.name,
      params.slug,
      params.description ?? null,
    ],
  );

  const r = result.rows[0] as any;
  return {
    id: r.id,
    bucketId: r.bucket_id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    isDefault: r.is_default,
  };
}

/**
 * Check if a bucket slug is valid for a user (either a predefined bucket or user-created).
 */
export async function isValidUserBucket(userId: number, slug: string): Promise<boolean> {
  // Predefined buckets are always valid
  const predefined = ['conversation', 'tool-results', 'preferences', 'knowledge', 'system', 'custom', 'main'];
  if (predefined.includes(slug)) return true;

  // Check user-created buckets
  const bucket = await getBucketBySlug(userId, slug);
  return bucket !== null;
}

// ─────────────────────────────────────────────────────────────
// Forensic Snapshots
// ─────────────────────────────────────────────────────────────

export async function createSnapshot(params: {
  memoryId: number;
  pointerId: string;
  contentHash: string;
  snapshotEncrypted: Buffer;
  snapshotIv: Buffer;
  snapshotTag: Buffer;
  reason: string;
  createdBy: number;
}): Promise<void> {
  await query(
    `INSERT INTO forensic_snapshots
       (memory_id, pointer_id, content_hash, snapshot_encrypted, snapshot_iv, snapshot_tag, reason, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      params.memoryId,
      params.pointerId,
      params.contentHash,
      params.snapshotEncrypted,
      params.snapshotIv,
      params.snapshotTag,
      params.reason,
      params.createdBy,
    ],
  );
}

// ─────────────────────────────────────────────────────────────
// OAuth Clients
// ─────────────────────────────────────────────────────────────

export interface OAuthClientRow {
  id: number;
  client_id: string;
  client_secret_hash: string | null;
  client_name: string | null;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  scope: string | null;
  token_endpoint_auth_method: string | null;
  client_id_issued_at: number;
  client_secret_expires_at: number;
  created_at: Date;
}

export async function getOAuthClient(clientId: string): Promise<OAuthClientRow | null> {
  const result = await query<OAuthClientRow>(
    `SELECT * FROM mcp_oauth_clients WHERE client_id = $1`,
    [clientId],
  );
  return result.rows[0] ?? null;
}

export async function insertOAuthClient(params: {
  clientId: string;
  clientSecretHash?: string;
  clientName?: string;
  redirectUris: string[];
  grantTypes?: string[];
  responseTypes?: string[];
  scope?: string;
  tokenEndpointAuthMethod?: string;
  clientIdIssuedAt: number;
  clientSecretExpiresAt?: number;
}): Promise<void> {
  await query(
    `INSERT INTO mcp_oauth_clients
       (client_id, client_secret_hash, client_name, redirect_uris,
        grant_types, response_types, scope, token_endpoint_auth_method,
        client_id_issued_at, client_secret_expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (client_id) DO NOTHING`,
    [
      params.clientId,
      params.clientSecretHash ?? null,
      params.clientName ?? null,
      params.redirectUris,
      params.grantTypes ?? ['authorization_code', 'refresh_token'],
      params.responseTypes ?? ['code'],
      params.scope ?? 'memory:read memory:write profile:read',
      params.tokenEndpointAuthMethod ?? 'client_secret_post',
      params.clientIdIssuedAt,
      params.clientSecretExpiresAt ?? 0,
    ],
  );
}

// ─────────────────────────────────────────────────────────────
// Pending Auth Requests
// ─────────────────────────────────────────────────────────────

export interface PendingAuthRow {
  id: number;
  request_id: string;
  client_id: string;
  code_challenge: string;
  redirect_uri: string;
  state: string | null;
  scopes: string[] | null;
  resource: string | null;
  expires_at: Date;
}

export async function insertPendingAuth(params: {
  requestId: string;
  clientId: string;
  codeChallenge: string;
  redirectUri: string;
  state?: string;
  scopes?: string[];
  resource?: string;
}): Promise<void> {
  await query(
    `INSERT INTO mcp_pending_auth
       (request_id, client_id, code_challenge, redirect_uri, state, scopes, resource, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW() + INTERVAL '10 minutes')`,
    [
      params.requestId,
      params.clientId,
      params.codeChallenge,
      params.redirectUri,
      params.state ?? null,
      params.scopes ?? null,
      params.resource ?? null,
    ],
  );
}

export async function getPendingAuth(requestId: string): Promise<PendingAuthRow | null> {
  const result = await query<PendingAuthRow>(
    `SELECT * FROM mcp_pending_auth WHERE request_id = $1 AND expires_at > NOW()`,
    [requestId],
  );
  return result.rows[0] ?? null;
}

export async function deletePendingAuth(requestId: string): Promise<void> {
  await query(`DELETE FROM mcp_pending_auth WHERE request_id = $1`, [requestId]);
}

// ─────────────────────────────────────────────────────────────
// Auth Codes
// ─────────────────────────────────────────────────────────────

export async function insertAuthCode(params: {
  code: string;
  clientId: string;
  userId: number;
  codeChallenge: string;
  redirectUri: string;
  scopes: string[];
}): Promise<void> {
  await query(
    `INSERT INTO mcp_auth_codes
       (code, client_id, user_id, code_challenge, redirect_uri, scopes, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '5 minutes')`,
    [
      params.code,
      params.clientId,
      params.userId,
      params.codeChallenge,
      params.redirectUri,
      params.scopes,
    ],
  );
}

export async function getAuthCode(code: string, clientId: string): Promise<{
  code: string;
  client_id: string;
  user_id: number;
  code_challenge: string;
  redirect_uri: string;
  scopes: string[];
  used: boolean;
  expires_at: Date;
} | null> {
  const result = await query(
    `SELECT * FROM mcp_auth_codes
     WHERE code = $1 AND client_id = $2 AND used = false AND expires_at > NOW()`,
    [code, clientId],
  );
  return result.rows[0] ?? null;
}

export async function markAuthCodeUsed(code: string): Promise<void> {
  await query(`UPDATE mcp_auth_codes SET used = true WHERE code = $1`, [code]);
}

// ─────────────────────────────────────────────────────────────
// Refresh Tokens
// ─────────────────────────────────────────────────────────────

export async function insertRefreshToken(params: {
  tokenHash: string;
  clientId: string;
  userId: number;
  scopes: string[];
  ttlSeconds: number;
}): Promise<void> {
  await query(
    `INSERT INTO mcp_refresh_tokens (token_hash, client_id, user_id, scopes, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + INTERVAL '${params.ttlSeconds} seconds')`,
    [params.tokenHash, params.clientId, params.userId, params.scopes],
  );
}

export async function getRefreshToken(tokenHash: string): Promise<{
  token_hash: string;
  client_id: string;
  user_id: number;
  scopes: string[];
  expires_at: Date;
  revoked: boolean;
} | null> {
  const result = await query(
    `SELECT * FROM mcp_refresh_tokens
     WHERE token_hash = $1 AND revoked = false AND expires_at > NOW()`,
    [tokenHash],
  );
  return result.rows[0] ?? null;
}

export async function revokeRefreshToken(tokenHash: string): Promise<void> {
  await query(`UPDATE mcp_refresh_tokens SET revoked = true WHERE token_hash = $1`, [tokenHash]);
}

export async function revokeAllRefreshTokens(userId: number, clientId: string): Promise<void> {
  await query(
    `UPDATE mcp_refresh_tokens SET revoked = true WHERE user_id = $1 AND client_id = $2`,
    [userId, clientId],
  );
}

// ─────────────────────────────────────────────────────────────
// User / Profile Lookups (reads from shared users table)
// ─────────────────────────────────────────────────────────────

export interface UserRow {
  id: number;
  universal_id: string;
  clerk_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  image_url: string | null;
  provider: string;
  is_active: boolean;
  is_onboarded: boolean;
  created_at: Date;
  updated_at: Date;
}

export async function getUserById(userId: number): Promise<UserRow | null> {
  const result = await query<UserRow>(
    `SELECT * FROM users WHERE id = $1 AND is_active = true`,
    [userId],
  );
  return result.rows[0] ?? null;
}

export async function getUserByApiKeyHash(keyHash: string): Promise<{
  user: UserRow;
  keyScopes: string[];
  orgId: number | null;
  apiKeyId: number;
} | null> {
  try {
    const result = await query(
      `SELECT u.*, ak.id as api_key_id, ak.scopes as key_scopes, ak.org_id as key_org_id
       FROM api_keys ak
       JOIN users u ON ak.user_id = u.id
       WHERE ak.key_hash = $1 AND ak.is_active = true AND u.is_active = true`,
      [keyHash],
    );
    if (!result.rows[0]) return null;
    const row = result.rows[0];
    return {
      user: row as UserRow,
      keyScopes: row.key_scopes ?? ['memory:read', 'memory:write'],
      orgId: row.key_org_id ?? null,
      apiKeyId: row.api_key_id,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    // If tables don't exist yet, log a warning instead of crashing
    if (msg.includes('does not exist')) {
      console.warn(`[DB] getUserByApiKeyHash: table missing — ${msg}`);
      return null;
    }
    throw error;
  }
}

export async function getOrgForUser(userId: number): Promise<{
  org_id: number;
  name: string;
  slug: string;
} | null> {
  const result = await query(
    `SELECT o.id as org_id, o.name, o.slug
     FROM organizations o
     WHERE o.owner_id = $1 AND o.is_active = true
     ORDER BY o.created_at ASC LIMIT 1`,
    [userId],
  );
  return result.rows[0] ?? null;
}

export async function updateUserProfile(userId: number, updates: {
  firstName?: string;
  lastName?: string;
  fullName?: string;
}): Promise<UserRow | null> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (updates.firstName !== undefined) { sets.push(`first_name = $${idx++}`); values.push(updates.firstName); }
  if (updates.lastName !== undefined) { sets.push(`last_name = $${idx++}`); values.push(updates.lastName); }
  if (updates.fullName !== undefined) { sets.push(`full_name = $${idx++}`); values.push(updates.fullName); }

  if (sets.length === 0) return null;

  values.push(userId);
  const result = await query<UserRow>(
    `UPDATE users SET ${sets.join(', ')}, updated_at = NOW()
     WHERE id = $${idx} AND is_active = true RETURNING *`,
    values,
  );
  return result.rows[0] ?? null;
}

/**
 * Get all active memories for a user (for context building).
 * Returns pointer_id plus metadata — content must be decrypted separately.
 */
export async function getMemoriesForContext(params: {
  userId: number;
  buckets?: string[];
  limit?: number;
}): Promise<MemoryRow[]> {
  const conditions = ['user_id = $1', 'is_active = true'];
  const values: unknown[] = [params.userId];
  let idx = 2;

  if (params.buckets && params.buckets.length > 0) {
    conditions.push(`bucket = ANY($${idx})`);
    values.push(params.buckets);
    idx++;
  }

  const limit = Math.min(params.limit ?? 100, 200);

  const result = await query<MemoryRow>(
    `SELECT * FROM memories
     WHERE ${conditions.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT ${limit}`,
    values,
  );
  return result.rows;
}
