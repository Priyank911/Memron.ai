/**
 * Full Sync: Aiven (primary) → Supabase (MCP mirror)
 * 
 * Copies all users, organizations, org_members, api_keys, and buckets
 * from the Aiven primary database to the Supabase mirror that the
 * MCP server reads from.
 * 
 * Usage: node scripts/sync-aiven-to-supabase.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pg = require('d:/Memron.ai/apps/landing/node_modules/pg');
const { Pool } = pg;

// ─── Aiven (primary — landing app writes here) ──────────────
const aiven = new Pool({
  host: 'memron-1db-memron-1db.c.aivencloud.com',
  port: 27847,
  database: 'defaultdb',
  user: 'avnadmin',
  password: 'AVNS_2VDAVtGy3rBwXbswJaq',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

// ─── Supabase (mirror — MCP server reads here) ──────────────
const supa = new Pool({
  host: 'aws-1-ap-south-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.clfkehjbbvsbllonxrlz',
  password: 'P@&&word0911&supabase',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

// ─── Fix indexes first ──────────────────────────────────────

async function fixIndexes() {
  console.log('\n🔧 Fixing indexes on Supabase...');
  try {
    // Drop the old non-unique index (if exists)
    await supa.query('DROP INDEX IF EXISTS idx_api_keys_hash');
    // The unique one I created earlier may have suffix — rename it
    await supa.query('DROP INDEX IF EXISTS idx_api_keys_hash_unique');
    // Create the proper unique index
    await supa.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash)');
    console.log('  ✅ api_keys(key_hash) is now UNIQUE');
  } catch (e) {
    console.error('  ❌ Index fix failed:', e.message);
  }
}

// ─── Sync users ─────────────────────────────────────────────

async function syncUsers() {
  console.log('\n👤 Syncing users...');
  const { rows } = await aiven.query(
    `SELECT clerk_id, email, first_name, last_name, full_name, image_url,
            provider, is_active, is_onboarded, onboarded_at, created_at, updated_at, last_login_at
     FROM users ORDER BY id`
  );
  
  let synced = 0;
  for (const u of rows) {
    try {
      await supa.query(
        `INSERT INTO users (clerk_id, email, first_name, last_name, full_name, image_url,
                           provider, is_active, is_onboarded, onboarded_at, created_at, updated_at, last_login_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (clerk_id) DO UPDATE SET
           email = EXCLUDED.email,
           first_name = EXCLUDED.first_name,
           last_name = EXCLUDED.last_name,
           full_name = EXCLUDED.full_name,
           image_url = EXCLUDED.image_url,
           is_active = EXCLUDED.is_active,
           is_onboarded = EXCLUDED.is_onboarded,
           updated_at = EXCLUDED.updated_at,
           last_login_at = EXCLUDED.last_login_at`,
        [u.clerk_id, u.email, u.first_name, u.last_name, u.full_name, u.image_url,
         u.provider, u.is_active, u.is_onboarded, u.onboarded_at, u.created_at, u.updated_at, u.last_login_at]
      );
      synced++;
    } catch (e) {
      console.error(`  ❌ User ${u.email}: ${e.message}`);
    }
  }
  console.log(`  ✅ ${synced}/${rows.length} users synced`);
}

// ─── Sync organizations ─────────────────────────────────────

async function syncOrgs() {
  console.log('\n🏢 Syncing organizations...');
  const { rows } = await aiven.query(
    `SELECT o.org_id, o.name, o.slug, u.clerk_id as owner_clerk_id,
            o.logo_url, o.description, o.is_active, o.created_at, o.updated_at
     FROM organizations o
     JOIN users u ON o.owner_id = u.id
     ORDER BY o.id`
  );
  
  let synced = 0;
  for (const o of rows) {
    try {
      // Resolve owner_id in Supabase
      const userRes = await supa.query('SELECT id FROM users WHERE clerk_id = $1', [o.owner_clerk_id]);
      if (!userRes.rows[0]) {
        console.error(`  ⚠️ Org "${o.name}": owner ${o.owner_clerk_id} not found in Supabase`);
        continue;
      }
      const ownerId = userRes.rows[0].id;
      
      await supa.query(
        `INSERT INTO organizations (org_id, name, slug, owner_id, logo_url, description, is_active, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (slug) DO UPDATE SET
           name = EXCLUDED.name,
           owner_id = EXCLUDED.owner_id,
           is_active = EXCLUDED.is_active,
           updated_at = EXCLUDED.updated_at`,
        [o.org_id, o.name, o.slug, ownerId, o.logo_url, o.description, o.is_active, o.created_at, o.updated_at]
      );
      synced++;
    } catch (e) {
      console.error(`  ❌ Org "${o.name}": ${e.message}`);
    }
  }
  console.log(`  ✅ ${synced}/${rows.length} organizations synced`);
}

// ─── Sync org members ───────────────────────────────────────

async function syncOrgMembers() {
  console.log('\n👥 Syncing org members...');
  const { rows } = await aiven.query(
    `SELECT o.slug as org_slug, u.clerk_id as member_clerk_id, om.role
     FROM org_members om
     JOIN organizations o ON om.org_id = o.id
     JOIN users u ON om.user_id = u.id`
  );
  
  let synced = 0;
  for (const m of rows) {
    try {
      const orgRes = await supa.query('SELECT id FROM organizations WHERE slug = $1', [m.org_slug]);
      const userRes = await supa.query('SELECT id FROM users WHERE clerk_id = $1', [m.member_clerk_id]);
      if (!orgRes.rows[0] || !userRes.rows[0]) continue;
      
      await supa.query(
        `INSERT INTO org_members (org_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
        [orgRes.rows[0].id, userRes.rows[0].id, m.role]
      );
      synced++;
    } catch (e) {
      console.error(`  ❌ Member: ${e.message}`);
    }
  }
  console.log(`  ✅ ${synced}/${rows.length} org members synced`);
}

// ─── Sync API keys ──────────────────────────────────────────

async function syncApiKeys() {
  console.log('\n🔑 Syncing API keys...');
  const { rows } = await aiven.query(
    `SELECT ak.key_id, ak.key_prefix, ak.key_hash, ak.name, ak.scopes,
            ak.is_active, ak.last_used_at, ak.expires_at, ak.created_at,
            u.clerk_id as owner_clerk_id, o.slug as org_slug
     FROM api_keys ak
     JOIN users u ON ak.user_id = u.id
     LEFT JOIN organizations o ON ak.org_id = o.id
     ORDER BY ak.id`
  );
  
  let synced = 0;
  for (const k of rows) {
    try {
      const userRes = await supa.query('SELECT id FROM users WHERE clerk_id = $1', [k.owner_clerk_id]);
      if (!userRes.rows[0]) {
        console.error(`  ⚠️ Key ${k.key_prefix}: owner not found`);
        continue;
      }
      const userId = userRes.rows[0].id;
      
      let orgId = null;
      if (k.org_slug) {
        const orgRes = await supa.query('SELECT id FROM organizations WHERE slug = $1', [k.org_slug]);
        orgId = orgRes.rows[0]?.id ?? null;
      }
      
      await supa.query(
        `INSERT INTO api_keys (key_id, key_prefix, key_hash, name, user_id, org_id, scopes, is_active, last_used_at, expires_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (key_hash) DO UPDATE SET
           name = EXCLUDED.name,
           is_active = EXCLUDED.is_active,
           scopes = EXCLUDED.scopes,
           last_used_at = EXCLUDED.last_used_at`,
        [k.key_id, k.key_prefix, k.key_hash, k.name, userId, orgId, k.scopes,
         k.is_active, k.last_used_at, k.expires_at, k.created_at]
      );
      synced++;
    } catch (e) {
      console.error(`  ❌ Key ${k.key_prefix}: ${e.message}`);
    }
  }
  console.log(`  ✅ ${synced}/${rows.length} API keys synced`);
}

// ─── Sync buckets ───────────────────────────────────────────

async function syncBuckets() {
  console.log('\n📦 Syncing buckets...');
  
  // Check if buckets table exists in Aiven
  const exists = await aiven.query(
    `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'buckets')`
  );
  if (!exists.rows[0].exists) {
    console.log('  ⚠️ No buckets table in Aiven — skipping');
    return;
  }
  
  const { rows } = await aiven.query(
    `SELECT b.bucket_id, b.name, b.slug, b.description, b.is_default, b.is_active,
            b.memory_count, b.created_at, b.updated_at,
            u.clerk_id as owner_clerk_id, o.slug as org_slug
     FROM buckets b
     JOIN users u ON b.user_id = u.id
     LEFT JOIN organizations o ON b.org_id = o.id
     ORDER BY b.id`
  );
  
  let synced = 0;
  for (const b of rows) {
    try {
      const userRes = await supa.query('SELECT id FROM users WHERE clerk_id = $1', [b.owner_clerk_id]);
      if (!userRes.rows[0]) continue;
      const userId = userRes.rows[0].id;
      
      let orgId = null;
      if (b.org_slug) {
        const orgRes = await supa.query('SELECT id FROM organizations WHERE slug = $1', [b.org_slug]);
        orgId = orgRes.rows[0]?.id ?? null;
      }
      
      await supa.query(
        `INSERT INTO buckets (bucket_id, user_id, org_id, name, slug, description, is_default, is_active, memory_count, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (user_id, slug) DO UPDATE SET
           name = EXCLUDED.name,
           description = EXCLUDED.description,
           is_active = EXCLUDED.is_active,
           memory_count = EXCLUDED.memory_count,
           updated_at = EXCLUDED.updated_at`,
        [b.bucket_id, userId, orgId, b.name, b.slug, b.description, b.is_default,
         b.is_active, b.memory_count, b.created_at, b.updated_at]
      );
      synced++;
    } catch (e) {
      console.error(`  ❌ Bucket "${b.name}": ${e.message}`);
    }
  }
  console.log(`  ✅ ${synced}/${rows.length} buckets synced`);
}

// ─── Verify ─────────────────────────────────────────────────

async function verify() {
  console.log('\n🔍 Verification...');
  const users = await supa.query('SELECT count(*) as c FROM users');
  const orgs = await supa.query('SELECT count(*) as c FROM organizations');
  const keys = await supa.query('SELECT count(*) as c FROM api_keys');
  
  console.log(`  Users: ${users.rows[0].c}`);
  console.log(`  Orgs:  ${orgs.rows[0].c}`);
  console.log(`  Keys:  ${keys.rows[0].c}`);
  
  // Check the specific key
  const target = await supa.query(
    `SELECT ak.key_prefix, ak.is_active, u.email
     FROM api_keys ak JOIN users u ON ak.user_id = u.id
     WHERE ak.key_hash = '47bba0ed0f23f13b2bde4073e743ead102ca0466d487bfbcc2cf09a409195ec5'`
  );
  if (target.rows[0]) {
    console.log(`  ✅ Target key ${target.rows[0].key_prefix} found → ${target.rows[0].email}`);
  } else {
    console.log('  ❌ Target key STILL NOT FOUND');
  }
}

// ─── Main ───────────────────────────────────────────────────

try {
  console.log('═══════════════════════════════════════════');
  console.log('  Aiven → Supabase Full Sync');
  console.log('═══════════════════════════════════════════');
  
  await fixIndexes();
  await syncUsers();
  await syncOrgs();
  await syncOrgMembers();
  await syncApiKeys();
  await syncBuckets();
  await verify();
  
  console.log('\n✅ Sync complete!\n');
} catch (e) {
  console.error('\n❌ Fatal error:', e);
} finally {
  await aiven.end();
  await supa.end();
}
