/**
 * Supabase Sync Module
 *
 * Mirrors user / organization / API-key writes to the Supabase PostgreSQL
 * instance used by the MCP server.  This ensures the MCP server always has
 * the latest auth data even when the landing app's primary PG is a separate
 * database (e.g. Aiven in production).
 *
 * Env vars:
 *   SUPABASE_PG_HOST     — Supabase session-pooler host
 *   SUPABASE_PG_PORT     — (default 5432)
 *   SUPABASE_PG_DATABASE — (default "postgres")
 *   SUPABASE_PG_USER     — e.g. postgres.xxxxx
 *   SUPABASE_PG_PASSWORD
 *
 * When SUPABASE_PG_HOST is NOT set the module falls back to the primary PG_*
 * credentials.  If the resolved host equals the primary PG_HOST the sync is
 * skipped (same database — no duplicate write needed).
 */

import { Pool } from 'pg';

// ─── Resolve Supabase credentials ────────────────────────────

const SUPABASE_HOST = process.env.SUPABASE_PG_HOST || process.env.PG_HOST || '';
const SUPABASE_PORT = parseInt(process.env.SUPABASE_PG_PORT || process.env.PG_PORT || '5432', 10);
const SUPABASE_DB   = process.env.SUPABASE_PG_DATABASE || process.env.PG_DATABASE || 'postgres';
const SUPABASE_USER = process.env.SUPABASE_PG_USER || process.env.PG_USER || '';
const SUPABASE_PASS = process.env.SUPABASE_PG_PASSWORD || process.env.PG_PASSWORD || '';

const PRIMARY_HOST  = process.env.PG_HOST || '';

/**
 * If the resolved Supabase host is identical to the primary PG host the data
 * is already landing in the right place; skip the duplicate write.
 */
const isSameDatabase =
  SUPABASE_HOST !== '' &&
  PRIMARY_HOST !== '' &&
  SUPABASE_HOST === PRIMARY_HOST &&
  (process.env.SUPABASE_PG_DATABASE || process.env.PG_DATABASE || 'postgres') ===
    (process.env.PG_DATABASE || 'postgres');

const isConfigured = !!(SUPABASE_HOST && SUPABASE_USER && SUPABASE_PASS);

// ─── Supabase connection pool ────────────────────────────────

const sslConfig: any =
  process.env.SUPABASE_PG_SSL === 'false'
    ? false
    : { rejectUnauthorized: false };

let supaPool: Pool | null = null;

if (isConfigured) {
  supaPool = new Pool({
    host: SUPABASE_HOST,
    port: SUPABASE_PORT,
    database: SUPABASE_DB,
    user: SUPABASE_USER,
    password: SUPABASE_PASS,
    ssl: sslConfig,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000, // Reduced from 10s — fail fast
  });

  supaPool.on('error', (err) => {
    console.error('[SupaSync] Pool error:', err.message);
  });

  if (isSameDatabase) {
    // Same DB — sync writes skipped
  }
} else {
  console.warn('[SupaSync] Not configured — Supabase sync disabled. Set SUPABASE_PG_HOST to enable.');
}

// ─── Internal helpers ────────────────────────────────────────

async function exec(sql: string, params?: unknown[]) {
  if (!supaPool) return null;
  return supaPool.query(sql, params);
}

function logOk(_entity: string, _id: string | number) {
  // silent in production — success is the expected case
}

function logFail(entity: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.warn(`[SupaSync] ⚠️ ${entity} sync failed: ${msg}`);
}

// ─── Schema bootstrap (idempotent) ──────────────────────────

let schemaReady = false;
let schemaPromise: Promise<void> | null = null;

async function ensureSupabaseSchema(): Promise<void> {
  if (!supaPool || schemaReady) return;
  if (schemaPromise) { await schemaPromise; return; }
  schemaPromise = _bootstrap();
  await schemaPromise;
}

async function _bootstrap(): Promise<void> {
  try {
    // Users
    await exec(`
      CREATE TABLE IF NOT EXISTS users (
        id              SERIAL PRIMARY KEY,
        universal_id    UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
        clerk_id        VARCHAR(255) UNIQUE NOT NULL,
        email           VARCHAR(255) UNIQUE NOT NULL,
        first_name      VARCHAR(255),
        last_name       VARCHAR(255),
        full_name       VARCHAR(255),
        image_url       TEXT,
        provider        VARCHAR(50) DEFAULT 'email',
        is_active       BOOLEAN DEFAULT true,
        is_onboarded    BOOLEAN DEFAULT false,
        onboarded_at    TIMESTAMPTZ,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW(),
        last_login_at   TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Organizations
    await exec(`
      CREATE TABLE IF NOT EXISTS organizations (
        id              SERIAL PRIMARY KEY,
        org_id          UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
        name            VARCHAR(255) NOT NULL,
        slug            VARCHAR(255) UNIQUE NOT NULL,
        owner_id        INTEGER REFERENCES users(id) ON DELETE CASCADE,
        logo_url        TEXT,
        description     TEXT,
        is_active       BOOLEAN DEFAULT true,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // API keys
    await exec(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id              SERIAL PRIMARY KEY,
        key_id          UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
        key_prefix      VARCHAR(12) NOT NULL,
        key_hash        VARCHAR(255) NOT NULL,
        name            VARCHAR(255) DEFAULT 'Default API Key',
        user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
        org_id          INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
        scopes          TEXT[] DEFAULT ARRAY['memory:read', 'memory:write'],
        is_active       BOOLEAN DEFAULT true,
        last_used_at    TIMESTAMPTZ,
        expires_at      TIMESTAMPTZ,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Org members
    await exec(`
      CREATE TABLE IF NOT EXISTS org_members (
        id              SERIAL PRIMARY KEY,
        org_id          INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
        user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
        role            VARCHAR(50) DEFAULT 'member',
        joined_at       TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(org_id, user_id)
      )
    `);

    // Buckets (user-scoped memory namespaces)
    await exec(`
      CREATE TABLE IF NOT EXISTS buckets (
        id              SERIAL PRIMARY KEY,
        bucket_id       UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
        user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
        org_id          INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
        name            VARCHAR(255) NOT NULL,
        slug            VARCHAR(100) NOT NULL,
        description     TEXT,
        is_default      BOOLEAN DEFAULT false,
        is_active       BOOLEAN DEFAULT true,
        memory_count    INTEGER DEFAULT 0,
        created_at      TIMESTAMPTZ DEFAULT NOW(),
        updated_at      TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, slug)
      )
    `);

    // Indexes
    await exec(`CREATE INDEX IF NOT EXISTS idx_users_clerk_id ON users(clerk_id)`);
    await exec(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
    await exec(`CREATE INDEX IF NOT EXISTS idx_orgs_slug ON organizations(slug)`);
    await exec(`CREATE INDEX IF NOT EXISTS idx_orgs_owner ON organizations(owner_id)`);
    await exec(`CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id)`);
    await exec(`CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(org_id)`);
    await exec(`CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix)`);
    await exec(`CREATE INDEX IF NOT EXISTS idx_buckets_user ON buckets(user_id)`);
    await exec(`CREATE INDEX IF NOT EXISTS idx_buckets_org ON buckets(org_id)`);

    // Firebase Auth migration — add firebase_uid column, make clerk_id nullable
    await exec(`
      DO $$ BEGIN
        ALTER TABLE users ADD COLUMN IF NOT EXISTS firebase_uid VARCHAR(255) UNIQUE;
      EXCEPTION WHEN duplicate_column THEN NULL;
      END $$
    `);
    await exec(`
      DO $$ BEGIN
        ALTER TABLE users ALTER COLUMN clerk_id DROP NOT NULL;
      EXCEPTION WHEN others THEN NULL;
      END $$
    `);
    await exec(`CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid)`);

    // key_hash MUST be unique (ON CONFLICT depends on it).
    // Drop any pre-existing non-unique index before creating the unique one.
    await exec(`
      DO $$ BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_indexes
          WHERE indexname = 'idx_api_keys_hash'
          AND indexdef NOT LIKE '%UNIQUE%'
        ) THEN
          DROP INDEX idx_api_keys_hash;
        END IF;
      END $$
    `);
    await exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash)`);

    // Enable RLS & lock down PostgREST roles (anon / authenticated).
    // The app uses the postgres superuser which bypasses RLS.
    await exec(`
      DO $$
      DECLARE t TEXT; r TEXT;
      BEGIN
        FOREACH t IN ARRAY ARRAY[
          'users','organizations','api_keys','org_members','buckets'
        ] LOOP
          EXECUTE format('ALTER TABLE IF EXISTS %I ENABLE ROW LEVEL SECURITY', t);
          FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated') LOOP
            EXECUTE format('REVOKE ALL ON %I FROM %I', t, r);
          END LOOP;
        END LOOP;
      END $$
    `);

    schemaReady = true;
  } catch (err) {
    schemaPromise = null;
    logFail('schema bootstrap', err);
  }
}

// ═══════════════════════════════════════════════════════════════
// Public sync functions — all fire-and-forget safe
// ═══════════════════════════════════════════════════════════════

/**
 * Resolve or auto-provision a user in Supabase.
 * Checks firebase_uid, clerk_id, and email, creating the user if missing.
 */
export async function resolveOrProvisionSupabaseUser(data: {
  uid?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  imageUrl?: string | null;
  provider?: string | null;
}): Promise<number | null> {
  if (!supaPool) return null;

  try {
    await ensureSupabaseSchema();
    const uid = data.uid;
    const email = data.email;

    // 1. Try matching by UID (firebase_uid or clerk_id)
    if (uid) {
      const byUid = await exec(
        'SELECT id FROM users WHERE firebase_uid = $1 OR clerk_id = $1 LIMIT 1',
        [uid],
      );
      if (byUid?.rows[0]?.id) return byUid.rows[0].id;
    }

    // 2. Try matching by Email
    if (email) {
      const byEmail = await exec(
        'SELECT id FROM users WHERE email = $1 LIMIT 1',
        [email],
      );
      if (byEmail?.rows[0]?.id) {
        const existingId = byEmail.rows[0].id;
        if (uid) {
          await exec(
            'UPDATE users SET firebase_uid = COALESCE(firebase_uid, $1), clerk_id = COALESCE(clerk_id, $1) WHERE id = $2',
            [uid, existingId],
          );
        }
        return existingId;
      }
    }

    // 3. Auto-provision user in Supabase
    const userEmail = email || (uid ? `${uid}@memron.internal` : `user_${Date.now()}@memron.internal`);
    const userUid = uid || `user_${Date.now()}`;
    const name = data.fullName || [data.firstName, data.lastName].filter(Boolean).join(' ') || 'Memron User';

    const insertResult = await exec(
      `INSERT INTO users (
        universal_id, clerk_id, firebase_uid, email, first_name, last_name, full_name, image_url, provider, is_active, is_onboarded, created_at, updated_at, last_login_at
      )
      VALUES (
        gen_random_uuid(), $1, $1, $2, $3, $4, $5, $6, $7, true, true, NOW(), NOW(), NOW()
      )
      ON CONFLICT (email) DO UPDATE SET
        clerk_id = EXCLUDED.clerk_id,
        firebase_uid = EXCLUDED.firebase_uid,
        full_name = COALESCE(EXCLUDED.full_name, users.full_name),
        last_login_at = NOW()
      RETURNING id`,
      [
        userUid,
        userEmail,
        data.firstName || null,
        data.lastName || null,
        name,
        data.imageUrl || null,
        data.provider || 'email',
      ],
    );

    return insertResult?.rows[0]?.id || null;
  } catch (err: any) {
    logFail('resolveOrProvisionUser', err);
    return null;
  }
}

/**
 * Sync a user to Supabase.  Returns the Supabase user id.
 */
export async function syncUserToSupabase(data: {
  clerkId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  imageUrl?: string | null;
  provider?: string;
}): Promise<{ success: boolean; userId?: number; error?: string }> {
  if (!supaPool || isSameDatabase) return { success: true };

  try {
    await ensureSupabaseSchema();
    const result = await exec(
      `INSERT INTO users (clerk_id, firebase_uid, email, first_name, last_name, full_name, image_url, provider, last_login_at)
       VALUES ($1, $1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (email) DO UPDATE SET
         clerk_id     = EXCLUDED.clerk_id,
         firebase_uid = EXCLUDED.firebase_uid,
         first_name   = EXCLUDED.first_name,
         last_name    = EXCLUDED.last_name,
         full_name    = EXCLUDED.full_name,
         image_url    = EXCLUDED.image_url,
         last_login_at = NOW()
       RETURNING id`,
      [
        data.clerkId,
        data.email,
        data.firstName || null,
        data.lastName || null,
        data.fullName || null,
        data.imageUrl || null,
        data.provider || 'email',
      ],
    );

    const userId = result?.rows[0]?.id;
    logOk('user', data.clerkId);
    return { success: true, userId };
  } catch (err: any) {
    logFail('user', err);
    return { success: false, error: err.message };
  }
}

/**
 * Sync an organization to Supabase.  Returns the Supabase org id.
 */
export async function syncOrgToSupabase(data: {
  name: string;
  slug: string;
  ownerFirebaseUid?: string;
  ownerClerkId?: string;  // Legacy fallback
  ownerEmail?: string;
  orgUuid?: string | null;
  logoUrl?: string | null;
  description?: string | null;
}): Promise<{ success: boolean; orgId?: number; error?: string }> {
  if (!supaPool || isSameDatabase) return { success: true };

  try {
    await ensureSupabaseSchema();

    // Resolve owner user_id in Supabase
    const ownerId = await resolveOrProvisionSupabaseUser({
      uid: data.ownerFirebaseUid || data.ownerClerkId,
      email: data.ownerEmail,
    });
    
    if (!ownerId) {
      return { success: false, error: 'Failed to resolve or provision user in Supabase' };
    }

    // If an explicit Aiven org_id UUID is provided, use it instead of auto-generating
    const result = data.orgUuid
      ? await exec(
          `INSERT INTO organizations (org_id, name, slug, owner_id, logo_url, description)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (slug) DO UPDATE SET
             org_id      = EXCLUDED.org_id,
             name        = EXCLUDED.name,
             owner_id    = EXCLUDED.owner_id,
             logo_url    = EXCLUDED.logo_url,
             description = EXCLUDED.description,
             updated_at  = NOW()
           RETURNING id`,
          [data.orgUuid, data.name, data.slug, ownerId, data.logoUrl || null, data.description || null],
        )
      : await exec(
          `INSERT INTO organizations (name, slug, owner_id, logo_url, description)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (slug) DO UPDATE SET
             name        = EXCLUDED.name,
             owner_id    = EXCLUDED.owner_id,
             logo_url    = EXCLUDED.logo_url,
             description = EXCLUDED.description,
             updated_at  = NOW()
           RETURNING id`,
          [data.name, data.slug, ownerId, data.logoUrl || null, data.description || null],
        );

    const orgId = result?.rows[0]?.id;

    // Also add owner as admin member
    await exec(
      `INSERT INTO org_members (org_id, user_id, role)
       VALUES ($1, $2, 'admin')
       ON CONFLICT (org_id, user_id) DO NOTHING`,
      [orgId, ownerId],
    );

    logOk('organization', data.slug);
    return { success: true, orgId };
  } catch (err: any) {
    logFail('organization', err);
    return { success: false, error: err.message };
  }
}

/**
 * Sync an API key to Supabase.
 * IMPORTANT: only the hash is stored — the raw key is NEVER sent.
 */
export async function syncApiKeyToSupabase(data: {
  keyId?: string | null;
  keyPrefix: string;
  keyHash: string;
  name: string;
  ownerFirebaseUid?: string | null;
  ownerClerkId?: string | null;  // Legacy fallback
  ownerEmail?: string | null;
  ownerName?: string | null;
  scopes?: string[];
  expiresAt?: Date | null;
}): Promise<{ success: boolean; error?: string }> {
  if (!supaPool || isSameDatabase) return { success: true };

  try {
    await ensureSupabaseSchema();

    // 1. Resolve or auto-provision user in Supabase
    const userId = await resolveOrProvisionSupabaseUser({
      uid: data.ownerFirebaseUid || data.ownerClerkId,
      email: data.ownerEmail,
      fullName: data.ownerName,
    });
    
    if (!userId) {
      return { success: false, error: 'Unable to resolve or provision user in Supabase' };
    }

    // 2. Ensure user has an organization in Supabase
    let orgRes = await exec(
      'SELECT id FROM organizations WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId],
    );
    let orgId = orgRes?.rows[0]?.id ?? null;

    if (!orgId) {
      const newOrgSlug = `org-${userId}-${Date.now().toString(36)}`;
      const newOrgRes = await exec(
        `INSERT INTO organizations (name, slug, owner_id, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, true, NOW(), NOW())
         ON CONFLICT (slug) DO UPDATE SET owner_id = EXCLUDED.owner_id
         RETURNING id`,
        ['Personal Workspace', newOrgSlug, userId],
      );
      orgId = newOrgRes?.rows[0]?.id ?? null;
      if (orgId) {
        await exec(
          `INSERT INTO org_members (org_id, user_id, role) VALUES ($1, $2, 'admin') ON CONFLICT (org_id, user_id) DO NOTHING`,
          [orgId, userId],
        );
      }
    }

    // 3. Insert or update API key
    if (data.keyId) {
      await exec(
        `INSERT INTO api_keys (key_id, key_prefix, key_hash, name, user_id, org_id, scopes, expires_at, is_active, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, NOW())
         ON CONFLICT (key_hash) DO UPDATE SET
           name       = EXCLUDED.name,
           user_id    = EXCLUDED.user_id,
           org_id     = EXCLUDED.org_id,
           is_active  = true,
           scopes     = EXCLUDED.scopes
         `,
        [
          data.keyId,
          data.keyPrefix,
          data.keyHash,
          data.name,
          userId,
          orgId,
          data.scopes || ['memory:read', 'memory:write', 'memory:delete'],
          data.expiresAt || null,
        ],
      );
    } else {
      await exec(
        `INSERT INTO api_keys (key_prefix, key_hash, name, user_id, org_id, scopes, expires_at, is_active, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW())
         ON CONFLICT (key_hash) DO UPDATE SET
           name       = EXCLUDED.name,
           user_id    = EXCLUDED.user_id,
           org_id     = EXCLUDED.org_id,
           is_active  = true,
           scopes     = EXCLUDED.scopes
         `,
        [
          data.keyPrefix,
          data.keyHash,
          data.name,
          userId,
          orgId,
          data.scopes || ['memory:read', 'memory:write', 'memory:delete'],
          data.expiresAt || null,
        ],
      );
    }

    logOk('api_key', data.keyPrefix);
    return { success: true };
  } catch (err: any) {
    logFail('api_key', err);
    return { success: false, error: err.message };
  }
}

/**
 * Revoke an API key in Supabase (by key_id + uid).
 */
export async function revokeApiKeyInSupabase(keyId: string, uid: string): Promise<boolean> {
  if (!supaPool || isSameDatabase) return true;

  try {
    await ensureSupabaseSchema();
    const userId = await resolveOrProvisionSupabaseUser({ uid });
    if (!userId) return false;

    await exec(
      'UPDATE api_keys SET is_active = false WHERE (key_id::text = $1 OR key_prefix = $1) AND user_id = $2',
      [keyId, userId],
    );
    logOk('api_key revoke', keyId);
    return true;
  } catch (err) {
    logFail('api_key revoke', err);
    return false;
  }
}

/**
 * Create the user's default "main" bucket in Supabase.
 * Called once during onboarding completion — gives every user a root namespace
 * for their memories.
 */
export async function createUserMainBucket(data: {
  authUserId?: string;
  clerkId?: string; // Backwards compatibility alias
  email?: string;
  bucketName?: string;
}): Promise<{ success: boolean; error?: string }> {
  if (!supaPool || isSameDatabase) return { success: true };

  try {
    await ensureSupabaseSchema();

    // Resolve user
    const userId = await resolveOrProvisionSupabaseUser({
      uid: data.authUserId || data.clerkId,
      email: data.email,
    });
    if (!userId) {
      return { success: false, error: 'User not found in Supabase' };
    }

    const orgRes = await exec(
      'SELECT id FROM organizations WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId],
    );
    const orgId = orgRes?.rows[0]?.id ?? null;

    const name = data.bucketName || 'Main';
    const slug = 'main';

    await exec(
      `INSERT INTO buckets (user_id, org_id, name, slug, description, is_default)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (user_id, slug) DO NOTHING`,
      [userId, orgId, name, slug, 'Default memory bucket — your personal knowledge base'],
    );

    logOk('main bucket', `user=${userId}`);
    return { success: true };
  } catch (err: any) {
    logFail('main bucket', err);
    return { success: false, error: err.message };
  }
}

/**
 * Sync an arbitrary bucket to Supabase (called when users create custom buckets).
 */
export async function syncBucketToSupabase(data: {
  bucketId: string;
  ownerAuthId?: string;
  ownerFirebaseUid?: string;
  ownerClerkId?: string;  // Legacy fallback
  ownerEmail?: string;
  name: string;
  slug: string;
  description?: string | null;
  isDefault?: boolean;
}): Promise<{ success: boolean; error?: string }> {
  if (!supaPool || isSameDatabase) return { success: true };

  try {
    await ensureSupabaseSchema();

    // Look up or auto-provision user in Supabase
    const userId = await resolveOrProvisionSupabaseUser({
      uid: data.ownerAuthId || data.ownerFirebaseUid || data.ownerClerkId,
      email: data.ownerEmail,
    });
    
    if (!userId) {
      return { success: false, error: 'User not found in Supabase' };
    }

    const orgRes = await exec(
      'SELECT id FROM organizations WHERE owner_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId],
    );
    const orgId = orgRes?.rows[0]?.id ?? null;

    await exec(
      `INSERT INTO buckets (bucket_id, user_id, org_id, name, slug, description, is_default)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, slug) DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         is_active = true,
         updated_at = NOW()`,
      [data.bucketId, userId, orgId, data.name, data.slug, data.description ?? null, data.isDefault ?? false],
    );

    logOk('bucket', data.slug);
    return { success: true };
  } catch (err: any) {
    logFail('bucket', err);
    return { success: false, error: err.message };
  }
}

/**
 * Mark user as onboarded in Supabase.
 */
export async function markUserOnboardedSupabase(uidOrEmail: string): Promise<boolean> {
  if (!supaPool || isSameDatabase) return true;

  try {
    await ensureSupabaseSchema();
    const userId = await resolveOrProvisionSupabaseUser({
      uid: uidOrEmail,
      email: uidOrEmail.includes('@') ? uidOrEmail : undefined,
    });
    if (!userId) return false;

    await exec(
      'UPDATE users SET is_onboarded = true, onboarded_at = NOW() WHERE id = $1',
      [userId],
    );
    logOk('user onboarded', uidOrEmail);
    return true;
  } catch (err) {
    logFail('user onboarded', err);
    return false;
  }
}

/**
 * Full onboarding sync — call this once at the end of onboarding to ensure
 * the complete user + org + key + bucket graph exists in Supabase.
 *
 * Safe to call multiple times; all writes are idempotent.
 */
export async function fullOnboardingSyncToSupabase(data: {
  authUserId?: string;
  clerkId?: string; // Backwards compatibility alias
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  imageUrl?: string | null;
  provider?: string;
  orgName: string;
  orgSlug: string;
  orgUuid?: string | null;
  orgDescription?: string | null;
  apiKeyId?: string | null;
  apiKeyPrefix: string;
  apiKeyHash: string;
  apiKeyName: string;
  apiKeyScopes?: string[];
}): Promise<void> {
  if (!supaPool || isSameDatabase) return;

  try {
    const uid = data.authUserId || data.clerkId || '';

    // 1. User
    const userSync = await syncUserToSupabase({
      clerkId: uid,
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      fullName: data.fullName,
      imageUrl: data.imageUrl,
      provider: data.provider,
    });
    if (!userSync.success) {
      console.error('[SupaSync] fullOnboardingSync aborted — user sync failed:', userSync.error);
      return;
    }

    // 2. Organization
    await syncOrgToSupabase({
      name: data.orgName,
      slug: data.orgSlug,
      ownerFirebaseUid: uid,
      ownerEmail: data.email,
      orgUuid: data.orgUuid,
      description: data.orgDescription,
    });

    // 3. API key
    await syncApiKeyToSupabase({
      keyId: data.apiKeyId,
      keyPrefix: data.apiKeyPrefix,
      keyHash: data.apiKeyHash,
      name: data.apiKeyName,
      ownerFirebaseUid: uid,
      ownerEmail: data.email,
      ownerName: data.fullName,
      scopes: data.apiKeyScopes,
    });

    // 4. Main bucket
    await createUserMainBucket({ authUserId: uid, email: data.email });

    // 5. Mark onboarded
    await markUserOnboardedSupabase(uid);
  } catch (err) {
    logFail('fullOnboardingSync', err);
  }
}
