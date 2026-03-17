-- Migration: Analysis Engine Tables
-- Description: Adds tables for episodes, memories, recipes, entities, versioning, and run tracking
-- Dependencies: pgvector extension

-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================================
-- Episodes Table
-- Stores semantic conversation episodes
-- ============================================================================
CREATE TABLE IF NOT EXISTS episodes (
  id SERIAL PRIMARY KEY,
  episode_id VARCHAR(50) UNIQUE NOT NULL,
  session_id UUID NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  episode_type VARCHAR(50) NOT NULL,
  start_index INTEGER NOT NULL,
  end_index INTEGER NOT NULL,
  outcome VARCHAR(20) DEFAULT 'neutral',
  outcome_confidence REAL DEFAULT 0.5,
  summary TEXT,
  raw_messages JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_episodes_session ON episodes(session_id);
CREATE INDEX idx_episodes_user ON episodes(user_id);
CREATE INDEX idx_episodes_outcome ON episodes(outcome);

-- ============================================================================
-- Atomic Memories Table
-- Structured memory units with confidence scoring and embeddings
-- ============================================================================
CREATE TABLE IF NOT EXISTS atomic_memories (
  id SERIAL PRIMARY KEY,
  memory_id VARCHAR(50) UNIQUE NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  episode_id VARCHAR(50) REFERENCES episodes(episode_id) ON DELETE SET NULL,
  workspace_id VARCHAR(50),
  agent_id VARCHAR(50),
  task_id VARCHAR(50),

  memory_type VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  compressed_content TEXT,

  confidence REAL DEFAULT 0.5,
  success_score REAL DEFAULT 0.5,
  failure_score REAL DEFAULT 0.2,
  transferability REAL DEFAULT 0.5,

  event_time TIMESTAMPTZ,
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_to TIMESTAMPTZ,

  supersedes_memory_id VARCHAR(50),
  source_span_start INTEGER DEFAULT 0,
  source_span_end INTEGER DEFAULT 0,
  graph_links JSONB DEFAULT '[]',

  share_policy VARCHAR(20) DEFAULT 'private',
  expiry TIMESTAMPTZ,

  embedding vector(1536),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_atomic_memories_user ON atomic_memories(user_id);
CREATE INDEX idx_atomic_memories_episode ON atomic_memories(episode_id);
CREATE INDEX idx_atomic_memories_type ON atomic_memories(memory_type);
CREATE INDEX idx_atomic_memories_confidence ON atomic_memories(confidence);
CREATE INDEX idx_atomic_memories_valid ON atomic_memories(valid_from, valid_to);
CREATE INDEX idx_atomic_memories_embedding ON atomic_memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================================
-- Success Recipes Table
-- Distilled success recipes with feedback tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS success_recipes (
  id SERIAL PRIMARY KEY,
  recipe_id VARCHAR(50) UNIQUE NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  workspace_id VARCHAR(50),

  recipe_name VARCHAR(255) NOT NULL,
  task_type VARCHAR(100) NOT NULL,
  problem_statement TEXT NOT NULL,
  problem_signature VARCHAR(64),

  recipe_content JSONB NOT NULL,

  success_rate REAL DEFAULT 0.5,
  avg_token_cost INTEGER DEFAULT 0,
  transferability_score REAL DEFAULT 0.5,

  usage_count INTEGER DEFAULT 0,
  positive_feedback INTEGER DEFAULT 0,
  negative_feedback INTEGER DEFAULT 0,

  recipe_version INTEGER DEFAULT 1,
  parent_recipe_id VARCHAR(50),

  embedding vector(1536),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_recipes_user ON success_recipes(user_id);
CREATE INDEX idx_recipes_task_type ON success_recipes(task_type);
CREATE INDEX idx_recipes_success_rate ON success_recipes(success_rate);
CREATE INDEX idx_recipes_problem_sig ON success_recipes(problem_signature);
CREATE INDEX idx_recipes_embedding ON success_recipes USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================================
-- Failure Patterns Table
-- Tracks common failure patterns for avoidance
-- ============================================================================
CREATE TABLE IF NOT EXISTS failure_patterns (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  task_type VARCHAR(100),
  pattern TEXT NOT NULL,
  symptom TEXT,
  probable_cause TEXT,
  avoidance_rule TEXT,
  occurrence_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_failure_patterns_user ON failure_patterns(user_id);
CREATE INDEX idx_failure_patterns_task_type ON failure_patterns(task_type);

-- ============================================================================
-- Entities Table
-- Knowledge graph nodes
-- ============================================================================
CREATE TABLE IF NOT EXISTS entities (
  id SERIAL PRIMARY KEY,
  entity_id VARCHAR(50) UNIQUE NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,

  name VARCHAR(500) NOT NULL,
  canonical_name VARCHAR(500),
  entity_type VARCHAR(100),
  description TEXT,

  first_seen_in VARCHAR(50),
  mention_count INTEGER DEFAULT 1,

  embedding vector(1536),

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_entities_user ON entities(user_id);
CREATE INDEX idx_entities_canonical ON entities(canonical_name);
CREATE INDEX idx_entities_type ON entities(entity_type);
CREATE INDEX idx_entities_embedding ON entities USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================================
-- Entity Relationships Table
-- Knowledge graph edges
-- ============================================================================
CREATE TABLE IF NOT EXISTS entity_relationships (
  id SERIAL PRIMARY KEY,
  relationship_id VARCHAR(50) UNIQUE NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,

  source_entity_id VARCHAR(50) REFERENCES entities(entity_id) ON DELETE CASCADE,
  target_entity_id VARCHAR(50) REFERENCES entities(entity_id) ON DELETE CASCADE,
  relationship_type VARCHAR(100),

  strength REAL DEFAULT 0.5,
  evidence_count INTEGER DEFAULT 1,
  source_memories TEXT[],

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_entity_rels_user ON entity_relationships(user_id);
CREATE INDEX idx_entity_rels_source ON entity_relationships(source_entity_id);
CREATE INDEX idx_entity_rels_target ON entity_relationships(target_entity_id);
CREATE INDEX idx_entity_rels_type ON entity_relationships(relationship_type);

-- ============================================================================
-- Prompt Templates Table
-- Template definitions for prompt versioning
-- ============================================================================
CREATE TABLE IF NOT EXISTS prompt_templates (
  id SERIAL PRIMARY KEY,
  template_id VARCHAR(50) UNIQUE NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_prompt_templates_user ON prompt_templates(user_id);

-- ============================================================================
-- Prompt Versions Table
-- Version tracking for prompts
-- ============================================================================
CREATE TABLE IF NOT EXISTS prompt_versions (
  id SERIAL PRIMARY KEY,
  prompt_version_id VARCHAR(50) UNIQUE NOT NULL,
  prompt_template_id VARCHAR(50) REFERENCES prompt_templates(template_id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  parent_version_id VARCHAR(50),
  branch_label VARCHAR(100),
  status VARCHAR(20) DEFAULT 'draft',

  raw_text TEXT NOT NULL,
  structured_config JSONB,

  system_block TEXT,
  memory_block TEXT,
  retrieval_block TEXT,
  tool_block TEXT,
  output_schema TEXT,

  change_summary TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_prompt_versions_template ON prompt_versions(prompt_template_id);
CREATE INDEX idx_prompt_versions_status ON prompt_versions(status);
CREATE INDEX idx_prompt_versions_number ON prompt_versions(version_number);

-- ============================================================================
-- Prompt Diffs Table
-- Semantic diffs between prompt versions
-- ============================================================================
CREATE TABLE IF NOT EXISTS prompt_diffs (
  id SERIAL PRIMARY KEY,
  from_version_id VARCHAR(50) REFERENCES prompt_versions(prompt_version_id),
  to_version_id VARCHAR(50) REFERENCES prompt_versions(prompt_version_id),
  diff_type VARCHAR(50),
  semantic_change TEXT,
  impact_hypothesis TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_prompt_diffs_from ON prompt_diffs(from_version_id);
CREATE INDEX idx_prompt_diffs_to ON prompt_diffs(to_version_id);

-- ============================================================================
-- Run Records Table
-- Execution tracking with outcome correlation
-- ============================================================================
CREATE TABLE IF NOT EXISTS run_records (
  id SERIAL PRIMARY KEY,
  run_id VARCHAR(50) UNIQUE NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL,
  agent_id VARCHAR(50),
  workspace_id VARCHAR(50),
  task_id VARCHAR(50),

  prompt_version_id VARCHAR(50) REFERENCES prompt_versions(prompt_version_id),
  context_version_id VARCHAR(50),
  retrieval_version_id VARCHAR(50),
  tooling_version_id VARCHAR(50),
  evaluation_version_id VARCHAR(50),

  model_name VARCHAR(100),
  model_params JSONB,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  latency_ms INTEGER DEFAULT 0,
  cost REAL,

  hallucination_flag BOOLEAN DEFAULT false,
  success_score REAL DEFAULT 0.5,
  user_feedback VARCHAR(20),
  final_acceptance BOOLEAN DEFAULT false,
  failure_reason TEXT,

  source_artifacts TEXT[],

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_run_records_user ON run_records(user_id);
CREATE INDEX idx_run_records_session ON run_records(session_id);
CREATE INDEX idx_run_records_prompt ON run_records(prompt_version_id);
CREATE INDEX idx_run_records_success ON run_records(success_score);
CREATE INDEX idx_run_records_hallucination ON run_records(hallucination_flag);

-- ============================================================================
-- Memory Packets Table
-- Stored context packets for reuse
-- ============================================================================
CREATE TABLE IF NOT EXISTS memory_packets (
  id SERIAL PRIMARY KEY,
  packet_id VARCHAR(50) UNIQUE NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,

  query_embedding vector(1536),
  packet_content JSONB NOT NULL,

  token_count INTEGER DEFAULT 0,
  risk_level VARCHAR(20),
  source_memory_ids TEXT[],

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_memory_packets_user ON memory_packets(user_id);
CREATE INDEX idx_memory_packets_risk ON memory_packets(risk_level);
CREATE INDEX idx_memory_packets_embedding ON memory_packets USING ivfflat (query_embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================================
-- Update timestamp trigger function
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update triggers
CREATE TRIGGER update_atomic_memories_updated_at
  BEFORE UPDATE ON atomic_memories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_success_recipes_updated_at
  BEFORE UPDATE ON success_recipes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_entities_updated_at
  BEFORE UPDATE ON entities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
