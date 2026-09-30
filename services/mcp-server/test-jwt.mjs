import pg from './node_modules/pg/lib/index.js';
const { Pool } = pg;

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Load it from a local, untracked .env file.`);
  return value;
};

const pool = new Pool(process.env.DATABASE_URL ? {
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 8000,
} : {
  host: required('PG_HOST'),
  port: Number(process.env.PG_PORT || 5432),
  database: process.env.PG_DATABASE || 'postgres',
  user: required('PG_USER'),
  password: required('PG_PASSWORD'),
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 8000,
});

const r = await pool.query(
  `SELECT u.email, ak.key_prefix FROM api_keys ak 
   JOIN users u ON ak.user_id = u.id 
   WHERE u.email = $1`,
  [required('MEMRON_EXPECTED_EMAIL')]
);
console.log('API keys:', JSON.stringify(r.rows));

// Also check if the JWT_SECRET is stored somewhere accessible
// Check what JWT_SECRET the worker has by looking at a signed token from the /token endpoint

await pool.end();
