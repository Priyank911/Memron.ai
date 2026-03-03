/**
 * Create main buckets for all existing users who don't have one yet.
 * Run once after adding the buckets feature.
 * 
 * Usage: node scripts/create-missing-buckets.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pg = require('d:/Memron.ai/apps/landing/node_modules/pg');
const { Pool } = pg;

const aiven = new Pool({
  host: 'memron-1db-memron-1db.c.aivencloud.com',
  port: 27847,
  database: 'defaultdb',
  user: 'avnadmin',
  password: 'AVNS_2VDAVtGy3rBwXbswJaq',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

const supa = new Pool({
  host: 'aws-1-ap-south-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.clfkehjbbvsbllonxrlz',
  password: 'P@&&word0911&supabase',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

async function createBucketsTable(label, pool) {
  console.log(`\n📦 Ensuring buckets table in ${label}...`);
  await pool.query(`
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
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_buckets_user ON buckets(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_buckets_org ON buckets(org_id)`);
  console.log(`  ✅ buckets table ready`);
}

async function createMainBuckets(label, pool) {
  console.log(`\n👤 Creating main buckets in ${label}...`);
  
  const users = await pool.query(`
    SELECT u.id, u.email, 
           (SELECT id FROM organizations WHERE owner_id = u.id ORDER BY created_at ASC LIMIT 1) as org_id
    FROM users u
    WHERE u.is_active = true
    AND NOT EXISTS (SELECT 1 FROM buckets b WHERE b.user_id = u.id AND b.slug = 'main')
  `);
  
  let created = 0;
  for (const u of users.rows) {
    try {
      await pool.query(
        `INSERT INTO buckets (user_id, org_id, name, slug, description, is_default)
         VALUES ($1, $2, 'Main', 'main', 'Default memory bucket', true)
         ON CONFLICT (user_id, slug) DO NOTHING`,
        [u.id, u.org_id]
      );
      created++;
      console.log(`  ✅ Created main bucket for ${u.email}`);
    } catch (e) {
      console.error(`  ❌ ${u.email}: ${e.message}`);
    }
  }
  
  if (users.rows.length === 0) {
    console.log('  All users already have main buckets');
  } else {
    console.log(`  ✅ ${created}/${users.rows.length} main buckets created`);
  }
}

try {
  console.log('═══════════════════════════════════════════');
  console.log('  Create Missing Main Buckets');
  console.log('═══════════════════════════════════════════');
  
  await createBucketsTable('Aiven', aiven);
  await createMainBuckets('Aiven', aiven);
  
  await createBucketsTable('Supabase', supa);
  await createMainBuckets('Supabase', supa);
  
  // Final verification
  console.log('\n🔍 Verification...');
  const aivenBuckets = await aiven.query('SELECT count(*) as c FROM buckets');
  const supaBuckets = await supa.query('SELECT count(*) as c FROM buckets');
  console.log(`  Aiven buckets: ${aivenBuckets.rows[0].c}`);
  console.log(`  Supabase buckets: ${supaBuckets.rows[0].c}`);
  
  console.log('\n✅ Done!\n');
} catch (e) {
  console.error('\n❌ Fatal error:', e);
} finally {
  await aiven.end();
  await supa.end();
}
