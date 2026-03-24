/**
 * Analysis Tables Migration Runner
 * Run this script to apply the analysis engine database migrations
 *
 * Usage: npx tsx src/db/migrate-analysis.ts
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function runMigration() {
  let connectionString = process.env.DATABASE_URL;

  // Fall back to individual PG_* env vars (used by the rest of the MCP server)
  if (!connectionString) {
    const host = process.env.PG_HOST;
    const port = process.env.PG_PORT || '5432';
    const database = process.env.PG_DATABASE || 'postgres';
    const user = process.env.PG_USER;
    const password = process.env.PG_PASSWORD;

    if (!host || !user || !password) {
      console.error('ERROR: Set DATABASE_URL or PG_HOST/PG_USER/PG_PASSWORD environment variables');
      process.exit(1);
    }

    connectionString = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
  }

  const useSSL = process.env.PG_SSL === 'true' || connectionString.includes('supabase');
  const client = new pg.Client({
    connectionString,
    ssl: useSSL ? { rejectUnauthorized: false } : false,
  });

  try {
    console.log('Connecting to database...');
    await client.connect();

    console.log('Reading migration files...');
    const migration002Path = join(__dirname, 'migrations', '002_analysis_tables.sql');
    const migration003Path = join(__dirname, 'migrations', '003_fix_uuid_to_varchar.sql');
    const migration002SQL = readFileSync(migration002Path, 'utf-8');
    const migration003SQL = readFileSync(migration003Path, 'utf-8');

    console.log('Running migration 002_analysis_tables...');
    await client.query(migration002SQL);

    console.log('Running migration 003_fix_uuid_to_varchar...');
    await client.query(migration003SQL);

    console.log('All migrations completed successfully!');
    console.log('\nTables created:');
    console.log('  - episodes');
    console.log('  - atomic_memories');
    console.log('  - success_recipes');
    console.log('  - failure_patterns');
    console.log('  - entities');
    console.log('  - entity_relationships');
    console.log('  - prompt_templates');
    console.log('  - prompt_versions');
    console.log('  - prompt_diffs');
    console.log('  - run_records');
    console.log('  - memory_packets');

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
