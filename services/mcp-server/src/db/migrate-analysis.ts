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
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('ERROR: DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString });

  try {
    console.log('Connecting to database...');
    await client.connect();

    console.log('Reading migration file...');
    const migrationPath = join(__dirname, 'migrations', '002_analysis_tables.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    console.log('Running migration...');
    await client.query(migrationSQL);

    console.log('Migration completed successfully!');
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
