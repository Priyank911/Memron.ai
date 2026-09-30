import pg from './node_modules/pg/lib/index.js';
const { Pool } = pg;
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const pool = new Pool({
  host: 'aws-1-ap-south-1.pooler.supabase.com',
  port: 5432,
  database: 'postgres',
  user: 'postgres.clfkehjbbvsbllonxrlz',
  password: 'aQnAOW4VSfIfIb91',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 8000,
});

const r = await pool.query(
  `SELECT u.email, ak.key_prefix FROM api_keys ak 
   JOIN users u ON ak.user_id = u.id 
   WHERE u.email = 'panchalpriyankfullstack@gmail.com'`
);
console.log('API keys:', JSON.stringify(r.rows));

// Also check if the JWT_SECRET is stored somewhere accessible
// Check what JWT_SECRET the worker has by looking at a signed token from the /token endpoint

await pool.end();
