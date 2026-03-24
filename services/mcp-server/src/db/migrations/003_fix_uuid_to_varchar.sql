-- Migration: Fix UUID columns to VARCHAR for nanoid-based IDs
-- Description: Alters prompt_templates, prompt_versions, prompt_diffs, run_records,
--              and memory_packets tables to use VARCHAR instead of UUID, matching
--              the application code which generates nanoid-based string IDs (tpl_xxx, pv_xxx, run_xxx).
-- Safe to run on databases created with either schema.ts or 002_analysis_tables.sql.

DO $$ BEGIN
  -- Only run if there are actually UUID columns to fix
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'prompt_templates'
      AND column_name = 'template_id'
      AND data_type = 'uuid'
  ) THEN
    -- ============================================================
    -- Step 1: Drop ALL foreign key constraints in the chain
    -- ============================================================
    -- prompt_diffs -> prompt_versions
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'prompt_diffs_from_version_id_fkey') THEN
      ALTER TABLE prompt_diffs DROP CONSTRAINT prompt_diffs_from_version_id_fkey;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'prompt_diffs_to_version_id_fkey') THEN
      ALTER TABLE prompt_diffs DROP CONSTRAINT prompt_diffs_to_version_id_fkey;
    END IF;

    -- run_records -> prompt_versions
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'run_records_prompt_version_id_fkey') THEN
      ALTER TABLE run_records DROP CONSTRAINT run_records_prompt_version_id_fkey;
    END IF;

    -- prompt_versions -> prompt_templates
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'prompt_versions_prompt_template_id_fkey') THEN
      ALTER TABLE prompt_versions DROP CONSTRAINT prompt_versions_prompt_template_id_fkey;
    END IF;

    -- ============================================================
    -- Step 2: Alter ALL columns from UUID to VARCHAR
    -- ============================================================

    -- prompt_templates
    ALTER TABLE prompt_templates ALTER COLUMN template_id DROP DEFAULT;
    ALTER TABLE prompt_templates ALTER COLUMN template_id TYPE VARCHAR(50) USING template_id::text;

    -- prompt_versions
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prompt_versions' AND column_name='prompt_version_id' AND data_type='uuid') THEN
      ALTER TABLE prompt_versions ALTER COLUMN prompt_version_id DROP DEFAULT;
      ALTER TABLE prompt_versions ALTER COLUMN prompt_version_id TYPE VARCHAR(50) USING prompt_version_id::text;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prompt_versions' AND column_name='prompt_template_id' AND data_type='uuid') THEN
      ALTER TABLE prompt_versions ALTER COLUMN prompt_template_id TYPE VARCHAR(50) USING prompt_template_id::text;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prompt_versions' AND column_name='parent_version_id' AND data_type='uuid') THEN
      ALTER TABLE prompt_versions ALTER COLUMN parent_version_id TYPE VARCHAR(50) USING parent_version_id::text;
    END IF;

    -- prompt_diffs
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prompt_diffs' AND column_name='diff_id' AND data_type='uuid') THEN
      ALTER TABLE prompt_diffs ALTER COLUMN diff_id DROP DEFAULT;
      ALTER TABLE prompt_diffs ALTER COLUMN diff_id TYPE VARCHAR(50) USING diff_id::text;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prompt_diffs' AND column_name='from_version_id' AND data_type='uuid') THEN
      ALTER TABLE prompt_diffs ALTER COLUMN from_version_id TYPE VARCHAR(50) USING from_version_id::text;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prompt_diffs' AND column_name='to_version_id' AND data_type='uuid') THEN
      ALTER TABLE prompt_diffs ALTER COLUMN to_version_id TYPE VARCHAR(50) USING to_version_id::text;
    END IF;

    -- run_records
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='run_records' AND column_name='run_id' AND data_type='uuid') THEN
      ALTER TABLE run_records ALTER COLUMN run_id DROP DEFAULT;
      ALTER TABLE run_records ALTER COLUMN run_id TYPE VARCHAR(50) USING run_id::text;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='run_records' AND column_name='session_id' AND data_type='uuid') THEN
      ALTER TABLE run_records ALTER COLUMN session_id TYPE VARCHAR(200) USING session_id::text;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='run_records' AND column_name='workspace_id' AND data_type='uuid') THEN
      ALTER TABLE run_records ALTER COLUMN workspace_id TYPE VARCHAR(50) USING workspace_id::text;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='run_records' AND column_name='prompt_version_id' AND data_type='uuid') THEN
      ALTER TABLE run_records ALTER COLUMN prompt_version_id TYPE VARCHAR(50) USING prompt_version_id::text;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='run_records' AND column_name='context_version_id' AND data_type='uuid') THEN
      ALTER TABLE run_records ALTER COLUMN context_version_id TYPE VARCHAR(50) USING context_version_id::text;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='run_records' AND column_name='retrieval_version_id' AND data_type='uuid') THEN
      ALTER TABLE run_records ALTER COLUMN retrieval_version_id TYPE VARCHAR(50) USING retrieval_version_id::text;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='run_records' AND column_name='tooling_version_id' AND data_type='uuid') THEN
      ALTER TABLE run_records ALTER COLUMN tooling_version_id TYPE VARCHAR(50) USING tooling_version_id::text;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='run_records' AND column_name='evaluation_version_id' AND data_type='uuid') THEN
      ALTER TABLE run_records ALTER COLUMN evaluation_version_id TYPE VARCHAR(50) USING evaluation_version_id::text;
    END IF;

    -- ============================================================
    -- Step 3: Re-add ALL foreign key constraints
    -- ============================================================
    ALTER TABLE prompt_versions ADD CONSTRAINT prompt_versions_prompt_template_id_fkey
      FOREIGN KEY (prompt_template_id) REFERENCES prompt_templates(template_id) ON DELETE CASCADE;

    ALTER TABLE prompt_diffs ADD CONSTRAINT prompt_diffs_from_version_id_fkey
      FOREIGN KEY (from_version_id) REFERENCES prompt_versions(prompt_version_id);
    ALTER TABLE prompt_diffs ADD CONSTRAINT prompt_diffs_to_version_id_fkey
      FOREIGN KEY (to_version_id) REFERENCES prompt_versions(prompt_version_id);

    ALTER TABLE run_records ADD CONSTRAINT run_records_prompt_version_id_fkey
      FOREIGN KEY (prompt_version_id) REFERENCES prompt_versions(prompt_version_id);
  END IF;
END $$;

-- ============================================================================
-- Fix memory_packets (schema.ts had wrong columns vs migration/code)
-- For databases created with schema.ts, drop and recreate with correct columns.
-- For databases created with 002_analysis_tables.sql, this is a no-op.
-- ============================================================================
DO $$ BEGIN
  -- Detect the schema.ts version by checking for the query_hash column
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'memory_packets'
      AND column_name = 'query_hash'
  ) THEN
    -- Drop the table created by schema.ts and recreate with correct columns
    DROP TABLE IF EXISTS memory_packets CASCADE;
    CREATE TABLE memory_packets (
      id                  SERIAL PRIMARY KEY,
      packet_id           VARCHAR(50) UNIQUE NOT NULL,
      user_id             INTEGER REFERENCES users(id) ON DELETE CASCADE,
      query_embedding     vector(1536),
      packet_content      JSONB NOT NULL,
      token_count         INTEGER DEFAULT 0,
      risk_level          VARCHAR(20),
      source_memory_ids   TEXT[],
      created_at          TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_packets_user ON memory_packets(user_id);
    CREATE INDEX IF NOT EXISTS idx_packets_risk ON memory_packets(risk_level);
  END IF;
END $$;
