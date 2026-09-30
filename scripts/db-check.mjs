import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pg = require('d:/Memron.ai/apps/landing/node_modules/pg');
import { createHash } from 'crypto';

const { Pool } = pg;

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Set it in an untracked environment file.`);
  return value;
};

const KEY = required('MEMRON_API_KEY');
const KEY_HASH = createHash('sha256').update(KEY).digest('hex');

console.log('Looking for key hash:', KEY_HASH);

// Aiven (primary - landing app writes here)
const aiven = new Pool({
  host: required('AIVEN_PG_HOST'),
  port: Number(process.env.AIVEN_PG_PORT || 5432),
  database: process.env.AIVEN_PG_DATABASE || 'defaultdb',
  user: required('AIVEN_PG_USER'),
  password: required('AIVEN_PG_PASSWORD'),
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000,
});

// Supabase (MCP server reads here)
const supa = new Pool({
  host: required('SUPABASE_PG_HOST'),
  port: Number(process.env.SUPABASE_PG_PORT || 5432),
  database: process.env.SUPABASE_PG_DATABASE || 'postgres',
  user: required('SUPABASE_PG_USER'),
  password: required('SUPABASE_PG_PASSWORD'),
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
