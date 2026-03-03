import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pg = require('d:/Memron.ai/apps/landing/node_modules/pg');
import { createHash } from 'crypto';

const { Pool } = pg;

const KEY = 'mm_live_4jzx3NwU0aQL9PnzdVN3OTt2kwMVxRJJsA9RDqEHMylzoyx0';
const KEY_HASH = createHash('sha256').update(KEY).digest('hex');

console.log('Looking for key hash:', KEY_HASH);

// Aiven (primary - landing app writes here)
const aiven = new Pool({
  host: 'memron-1db-memron-1db.c.aivencloud.com',
  port: 27847,
  database: 'defaultdb',
  user: 'avnadmin',
  password: 'AVNS_2VDAVtGy3rBwXbswJaq',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

// Supabase (MCP server reads here)
const supa = new Pool({
  host: 'aws-1-ap-south-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.clfkehjbbvsbllonxrlz',
  password: 'P@&&word0911&supabase',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

async function check(label, pool) {
  try {
    const users = await pool.query('SELECT count(*) as c FROM users');
    const keys = await pool.query('SELECT count(*) as c FROM api_keys');
    const allKeys = await pool.query('SELECT id, key_prefix, key_hash, is_active, user_id FROM api_keys LIMIT 10');
    const keyMatch = await pool.query(
      'SELECT ak.id, ak.key_prefix, ak.key_hash, ak.is_active, ak.user_id, u.email FROM api_keys ak LEFT JOIN users u ON ak.user_id = u.id WHERE ak.key_hash = $1',
      [KEY_HASH]
    );
    console.log(`\n=== ${label} ===`);
    console.log('Users:', users.rows[0].c);
    console.log('API Keys:', keys.rows[0].c);
    console.log('All keys:', JSON.stringify(allKeys.rows, null, 2));
    console.log('Key match:', keyMatch.rows.length > 0 ? JSON.stringify(keyMatch.rows[0]) : 'NOT FOUND');

    // Check indexes on api_keys
    const indexes = await pool.query(
      `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'api_keys'`
    );
    console.log('Indexes:', JSON.stringify(indexes.rows, null, 2));
  } catch(e) {
    console.log(`\n=== ${label} ===`);
    console.log('ERROR:', e.message);
  }
}

await check('AIVEN (Primary)', aiven);
await check('SUPABASE (MCP Mirror)', supa);

await aiven.end();
await supa.end();
