import 'dotenv/config';
import pg from 'pg';

const email = process.argv[2]?.trim().toLowerCase();
if (!email) throw new Error('Usage: npm run db:resolve-user -- email@example.com');

const client = new pg.Client({
  host: process.env.PG_HOST,
  port: Number(process.env.PG_PORT || 5432),
  database: process.env.PG_DATABASE,
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

try {
  await client.connect();
  const result = await client.query<{ id: number; email: string }>(
    'SELECT id, email FROM users WHERE lower(email) = $1 LIMIT 1',
    [email],
  );
  if (!result.rows[0]) throw new Error(`No Memron user found for ${email}`);
  console.log(JSON.stringify(result.rows[0]));
} finally {
  await client.end();
}
