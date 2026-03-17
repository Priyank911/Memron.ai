/**
 * Database Queries for Analysis Engine
 * CRUD operations for episodes, memories, recipes, entities, and run records
 */

import { query } from './client.js';

// ============================================================================
// Helpers
// ============================================================================

function validateEmbedding(embedding: number[]): void {
  if (embedding.length > 4096) {
    throw new Error(`Embedding dimension ${embedding.length} exceeds maximum of 4096`);
  }
  for (let i = 0; i < embedding.length; i++) {
    if (!Number.isFinite(embedding[i])) {
      throw new Error(`Embedding contains non-finite value at index ${i}`);
    }
  }
}

// ============================================================================
// Type Definitions
// ============================================================================

export interface EpisodeRow {
  id: number;
  episode_id: string;
  session_id: string;
  user_id: number;
  episode_type: string;
  start_index: number;
  end_index: number;
  outcome: string;
  outcome_confidence: number;
  summary: string | null;
  raw_messages: unknown;
  created_at: Date;
}

export interface AtomicMemoryRow {
  id: number;
  memory_id: string;
  user_id: number;
  episode_id: string | null;
  workspace_id: string | null;
  agent_id: string | null;
  task_id: string | null;
  memory_type: string;
  content: string;
  compressed_content: string | null;
  confidence: number;
  success_score: number;
  failure_score: number;
  transferability: number;
  event_time: Date | null;
  valid_from: Date;
  valid_to: Date | null;
  supersedes_memory_id: string | null;
  source_span_start: number;
  source_span_end: number;
  graph_links: unknown;
  share_policy: string;
  expiry: Date | null;
  embedding: number[] | null;
  created_at: Date;
  updated_at: Date;
}

export interface RecipeRow {
  id: number;
  recipe_id: string;
  user_id: number;
  workspace_id: string | null;
  recipe_name: string;
  task_type: string;
  problem_statement: string;
  problem_signature: string | null;
  recipe_content: unknown;
  success_rate: number;
  avg_token_cost: number;
  transferability_score: number;
  usage_count: number;
  positive_feedback: number;
  negative_feedback: number;
  recipe_version: number;
  parent_recipe_id: string | null;
  embedding: number[] | null;
  created_at: Date;
  updated_at: Date;
}

export interface EntityRow {
  id: number;
  entity_id: string;
  user_id: number;
  name: string;
  canonical_name: string | null;
  entity_type: string | null;
  description: string | null;
  first_seen_in: string | null;
  mention_count: number;
  embedding: number[] | null;
  created_at: Date;
  updated_at: Date;
}

export interface EntityRelationshipRow {
  id: number;
  relationship_id: string;
  user_id: number;
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: string | null;
  strength: number;
  evidence_count: number;
  source_memories: string[] | null;
  created_at: Date;
}

export interface RunRecordRow {
  id: number;
  run_id: string;
  user_id: number;
  session_id: string;
  agent_id: string | null;
  workspace_id: string | null;
  task_id: string | null;
  prompt_version_id: string | null;
  context_version_id: string | null;
  retrieval_version_id: string | null;
  tooling_version_id: string | null;
  evaluation_version_id: string | null;
  model_name: string | null;
  model_params: unknown;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
  cost: number | null;
  hallucination_flag: boolean;
  success_score: number;
  user_feedback: string | null;
  final_acceptance: boolean;
  failure_reason: string | null;
  source_artifacts: string[] | null;
  created_at: Date;
}

// ============================================================================
// Episode Operations
// ============================================================================

export async function insertEpisode(params: {
  episodeId: string;
  sessionId: string;
  userId: number;
  episodeType: string;
  startIndex: number;
  endIndex: number;
  outcome?: string;
  outcomeConfidence?: number;
  summary?: string;
  rawMessages?: unknown;
}): Promise<EpisodeRow> {
  const result = await query<EpisodeRow>(
    `INSERT INTO episodes (
      episode_id, session_id, user_id, episode_type,
      start_index, end_index, outcome, outcome_confidence,
      summary, raw_messages
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *`,
    [
      params.episodeId,
      params.sessionId,
      params.userId,
      params.episodeType,
      params.startIndex,
      params.endIndex,
      params.outcome || 'neutral',
      params.outcomeConfidence || 0.5,
      params.summary || null,
      JSON.stringify(params.rawMessages || null),
    ]
  );
  return result.rows[0];
}

export async function getEpisodeById(
  episodeId: string,
  userId: number
): Promise<EpisodeRow | null> {
  const result = await query<EpisodeRow>(
    `SELECT * FROM episodes WHERE episode_id = $1 AND user_id = $2`,
    [episodeId, userId]
  );
  return result.rows[0] || null;
}

export async function getEpisodesBySession(
  sessionId: string,
  userId: number
): Promise<EpisodeRow[]> {
  const result = await query<EpisodeRow>(
    `SELECT * FROM episodes WHERE session_id = $1 AND user_id = $2 ORDER BY start_index LIMIT 1000`,
    [sessionId, userId]
  );
  return result.rows;
}

// ============================================================================
// Atomic Memory Operations
// ============================================================================

export async function insertAtomicMemory(params: {
  memoryId: string;
  userId: number;
  episodeId?: string;
  workspaceId?: string;
  agentId?: string;
  taskId?: string;
  memoryType: string;
  content: string;
  compressedContent?: string;
  confidence?: number;
  successScore?: number;
  failureScore?: number;
  transferability?: number;
  eventTime?: Date;
  validFrom?: Date;
  validTo?: Date;
  supersedesMemoryId?: string;
  sourceSpanStart?: number;
  sourceSpanEnd?: number;
  graphLinks?: unknown;
  sharePolicy?: string;
  expiry?: Date;
  embedding?: number[];
}): Promise<AtomicMemoryRow> {
  const result = await query<AtomicMemoryRow>(
    `INSERT INTO atomic_memories (
      memory_id, user_id, episode_id, workspace_id, agent_id, task_id,
      memory_type, content, compressed_content,
      confidence, success_score, failure_score, transferability,
      event_time, valid_from, valid_to,
      supersedes_memory_id, source_span_start, source_span_end,
      graph_links, share_policy, expiry, embedding
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
      $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
    )
    RETURNING *`,
    [
      params.memoryId,
      params.userId,
      params.episodeId || null,
      params.workspaceId || null,
      params.agentId || null,
      params.taskId || null,
      params.memoryType,
      params.content,
      params.compressedContent || null,
      params.confidence || 0.5,
      params.successScore || 0.5,
      params.failureScore || 0.2,
      params.transferability || 0.5,
      params.eventTime || null,
      params.validFrom || new Date(),
      params.validTo || null,
      params.supersedesMemoryId || null,
      params.sourceSpanStart || 0,
      params.sourceSpanEnd || 0,
      JSON.stringify(params.graphLinks || []),
      params.sharePolicy || 'private',
      params.expiry || null,
      params.embedding ? (validateEmbedding(params.embedding), `[${params.embedding.join(',')}]`) : null,
    ]
  );
  return result.rows[0];
}

export async function getAtomicMemoryById(
  memoryId: string,
  userId: number
): Promise<AtomicMemoryRow | null> {
  const result = await query<AtomicMemoryRow>(
    `SELECT * FROM atomic_memories WHERE memory_id = $1 AND user_id = $2`,
    [memoryId, userId]
  );
  return result.rows[0] || null;
}

export async function searchAtomicMemories(params: {
  userId: number;
  memoryTypes?: string[];
  minConfidence?: number;
  limit?: number;
  offset?: number;
}): Promise<AtomicMemoryRow[]> {
  let sql = `SELECT * FROM atomic_memories WHERE user_id = $1 AND valid_to IS NULL`;
  const values: unknown[] = [params.userId];
  let paramIndex = 2;

  if (params.memoryTypes && params.memoryTypes.length > 0) {
    sql += ` AND memory_type = ANY($${paramIndex})`;
    values.push(params.memoryTypes);
    paramIndex++;
  }

  if (params.minConfidence !== undefined) {
    sql += ` AND confidence >= $${paramIndex}`;
    values.push(params.minConfidence);
    paramIndex++;
  }

  sql += ` ORDER BY confidence DESC, created_at DESC`;

  if (params.limit) {
    sql += ` LIMIT $${paramIndex}`;
    values.push(params.limit);
    paramIndex++;
  }

  if (params.offset) {
    sql += ` OFFSET $${paramIndex}`;
    values.push(params.offset);
  }

  const result = await query<AtomicMemoryRow>(sql, values);
  return result.rows;
}

export async function searchAtomicMemoriesByVector(params: {
  userId: number;
  embedding: number[];
  limit?: number;
  minSimilarity?: number;
}): Promise<(AtomicMemoryRow & { similarity: number })[]> {
  validateEmbedding(params.embedding);
  const embeddingStr = `[${params.embedding.join(',')}]`;
  const result = await query<AtomicMemoryRow & { similarity: number }>(
    `SELECT *, 1 - (embedding <=> $1::vector) as similarity
     FROM atomic_memories
     WHERE user_id = $2 AND valid_to IS NULL AND embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    [embeddingStr, params.userId, params.limit || 10]
  );

  if (params.minSimilarity) {
    return result.rows.filter((r) => r.similarity >= params.minSimilarity!);
  }
  return result.rows;
}

export async function updateAtomicMemory(
  memoryId: string,
  userId: number,
  updates: Partial<{
    confidence: number;
    successScore: number;
    failureScore: number;
    validTo: Date;
    sharePolicy: string;
  }>
): Promise<AtomicMemoryRow | null> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (updates.confidence !== undefined) {
    setClauses.push(`confidence = $${paramIndex}`);
    values.push(updates.confidence);
    paramIndex++;
  }
  if (updates.successScore !== undefined) {
    setClauses.push(`success_score = $${paramIndex}`);
    values.push(updates.successScore);
    paramIndex++;
  }
  if (updates.failureScore !== undefined) {
    setClauses.push(`failure_score = $${paramIndex}`);
    values.push(updates.failureScore);
    paramIndex++;
  }
  if (updates.validTo !== undefined) {
    setClauses.push(`valid_to = $${paramIndex}`);
    values.push(updates.validTo);
    paramIndex++;
  }
  if (updates.sharePolicy !== undefined) {
    setClauses.push(`share_policy = $${paramIndex}`);
    values.push(updates.sharePolicy);
    paramIndex++;
  }

  if (setClauses.length === 0) return null;

  values.push(memoryId, userId);

  const result = await query<AtomicMemoryRow>(
    `UPDATE atomic_memories SET ${setClauses.join(', ')}
     WHERE memory_id = $${paramIndex} AND user_id = $${paramIndex + 1}
     RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

// ============================================================================
// Recipe Operations
// ============================================================================

export async function insertRecipe(params: {
  recipeId: string;
  userId: number;
  workspaceId?: string;
  recipeName: string;
  taskType: string;
  problemStatement: string;
  problemSignature?: string;
  recipeContent: unknown;
  successRate?: number;
  avgTokenCost?: number;
  transferabilityScore?: number;
  recipeVersion?: number;
  parentRecipeId?: string;
  embedding?: number[];
}): Promise<RecipeRow> {
  const result = await query<RecipeRow>(
    `INSERT INTO success_recipes (
      recipe_id, user_id, workspace_id, recipe_name, task_type,
      problem_statement, problem_signature, recipe_content,
      success_rate, avg_token_cost, transferability_score,
      recipe_version, parent_recipe_id, embedding
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING *`,
    [
      params.recipeId,
      params.userId,
      params.workspaceId || null,
      params.recipeName,
      params.taskType,
      params.problemStatement,
      params.problemSignature || null,
      JSON.stringify(params.recipeContent),
      params.successRate || 0.5,
      params.avgTokenCost || 0,
      params.transferabilityScore || 0.5,
      params.recipeVersion || 1,
      params.parentRecipeId || null,
      params.embedding ? (validateEmbedding(params.embedding), `[${params.embedding.join(',')}]`) : null,
    ]
  );
  return result.rows[0];
}

export async function getRecipeById(
  recipeId: string,
  userId: number
): Promise<RecipeRow | null> {
  const result = await query<RecipeRow>(
    `SELECT * FROM success_recipes WHERE recipe_id = $1 AND user_id = $2`,
    [recipeId, userId]
  );
  return result.rows[0] || null;
}

export async function searchRecipes(params: {
  userId: number;
  taskType?: string;
  problemSignature?: string;
  minSuccessRate?: number;
  limit?: number;
}): Promise<RecipeRow[]> {
  let sql = `SELECT * FROM success_recipes WHERE user_id = $1`;
  const values: unknown[] = [params.userId];
  let paramIndex = 2;

  if (params.taskType) {
    sql += ` AND task_type = $${paramIndex}`;
    values.push(params.taskType);
    paramIndex++;
  }

  if (params.problemSignature) {
    sql += ` AND problem_signature = $${paramIndex}`;
    values.push(params.problemSignature);
    paramIndex++;
  }

  if (params.minSuccessRate !== undefined) {
    sql += ` AND success_rate >= $${paramIndex}`;
    values.push(params.minSuccessRate);
    paramIndex++;
  }

  sql += ` ORDER BY success_rate DESC, usage_count DESC`;

  if (params.limit) {
    sql += ` LIMIT $${paramIndex}`;
    values.push(params.limit);
  }

  const result = await query<RecipeRow>(sql, values);
  return result.rows;
}

export async function searchRecipesByVector(params: {
  userId: number;
  embedding: number[];
  limit?: number;
}): Promise<(RecipeRow & { similarity: number })[]> {
  validateEmbedding(params.embedding);
  const embeddingStr = `[${params.embedding.join(',')}]`;
  const result = await query<RecipeRow & { similarity: number }>(
    `SELECT *, 1 - (embedding <=> $1::vector) as similarity
     FROM success_recipes
     WHERE user_id = $2 AND embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $3`,
    [embeddingStr, params.userId, params.limit || 10]
  );
  return result.rows;
}

export async function updateRecipeFeedback(
  recipeId: string,
  userId: number,
  feedback: 'positive' | 'negative'
): Promise<RecipeRow | null> {
  const column = feedback === 'positive' ? 'positive_feedback' : 'negative_feedback';
  const result = await query<RecipeRow>(
    `UPDATE success_recipes
     SET ${column} = ${column} + 1,
         usage_count = usage_count + 1,
         success_rate = CASE
           WHEN $3 = 'positive' THEN
             (positive_feedback + 1)::float / NULLIF(positive_feedback + negative_feedback + 1, 0)
           ELSE
             positive_feedback::float / NULLIF(positive_feedback + negative_feedback + 1, 0)
         END
     WHERE recipe_id = $1 AND user_id = $2
     RETURNING *`,
    [recipeId, userId, feedback]
  );
  return result.rows[0] || null;
}

// ============================================================================
// Entity Operations
// ============================================================================

export async function insertEntity(params: {
  entityId: string;
  userId: number;
  name: string;
  canonicalName?: string;
  entityType?: string;
  description?: string;
  firstSeenIn?: string;
  mentionCount?: number;
  embedding?: number[];
}): Promise<EntityRow> {
  const result = await query<EntityRow>(
    `INSERT INTO entities (
      entity_id, user_id, name, canonical_name, entity_type,
      description, first_seen_in, mention_count, embedding
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (entity_id) DO UPDATE SET
      mention_count = entities.mention_count + EXCLUDED.mention_count,
      updated_at = NOW()
    RETURNING *`,
    [
      params.entityId,
      params.userId,
      params.name,
      params.canonicalName || params.name.toLowerCase(),
      params.entityType || null,
      params.description || null,
      params.firstSeenIn || null,
      params.mentionCount || 1,
      params.embedding ? (validateEmbedding(params.embedding), `[${params.embedding.join(',')}]`) : null,
    ]
  );
  return result.rows[0];
}

export async function getEntityByCanonicalName(
  canonicalName: string,
  userId: number
): Promise<EntityRow | null> {
  const result = await query<EntityRow>(
    `SELECT * FROM entities WHERE canonical_name = $1 AND user_id = $2`,
    [canonicalName, userId]
  );
  return result.rows[0] || null;
}

export async function searchEntities(params: {
  userId: number;
  entityType?: string;
  searchTerm?: string;
  limit?: number;
}): Promise<EntityRow[]> {
  let sql = `SELECT * FROM entities WHERE user_id = $1`;
  const values: unknown[] = [params.userId];
  let paramIndex = 2;

  if (params.entityType) {
    sql += ` AND entity_type = $${paramIndex}`;
    values.push(params.entityType);
    paramIndex++;
  }

  if (params.searchTerm) {
    sql += ` AND (name ILIKE $${paramIndex} OR canonical_name ILIKE $${paramIndex})`;
    values.push(`%${params.searchTerm}%`);
    paramIndex++;
  }

  sql += ` ORDER BY mention_count DESC`;

  if (params.limit) {
    sql += ` LIMIT $${paramIndex}`;
    values.push(params.limit);
  }

  const result = await query<EntityRow>(sql, values);
  return result.rows;
}

export async function insertEntityRelationship(params: {
  relationshipId: string;
  userId: number;
  sourceEntityId: string;
  targetEntityId: string;
  relationshipType?: string;
  strength?: number;
  evidenceCount?: number;
  sourceMemories?: string[];
}): Promise<EntityRelationshipRow> {
  const result = await query<EntityRelationshipRow>(
    `INSERT INTO entity_relationships (
      relationship_id, user_id, source_entity_id, target_entity_id,
      relationship_type, strength, evidence_count, source_memories
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *`,
    [
      params.relationshipId,
      params.userId,
      params.sourceEntityId,
      params.targetEntityId,
      params.relationshipType || null,
      params.strength || 0.5,
      params.evidenceCount || 1,
      params.sourceMemories || null,
    ]
  );
  return result.rows[0];
}

export async function getEntityRelationships(
  entityId: string,
  userId: number
): Promise<EntityRelationshipRow[]> {
  const result = await query<EntityRelationshipRow>(
    `SELECT * FROM entity_relationships
     WHERE user_id = $1 AND (source_entity_id = $2 OR target_entity_id = $2)
     ORDER BY strength DESC
     LIMIT 100`,
    [userId, entityId]
  );
  return result.rows;
}

export async function getEntityRelationshipsBatch(
  entityIds: string[],
  userId: number
): Promise<EntityRelationshipRow[]> {
  if (entityIds.length === 0) return [];
  const result = await query<EntityRelationshipRow>(
    `SELECT * FROM entity_relationships
     WHERE user_id = $1 AND (source_entity_id = ANY($2) OR target_entity_id = ANY($2))
     ORDER BY strength DESC
     LIMIT 500`,
    [userId, entityIds]
  );
  return result.rows;
}

// ============================================================================
// Run Record Operations
// ============================================================================

export async function insertRunRecord(params: {
  runId: string;
  userId: number;
  sessionId: string;
  agentId?: string;
  workspaceId?: string;
  taskId?: string;
  promptVersionId?: string;
  contextVersionId?: string;
  retrievalVersionId?: string;
  toolingVersionId?: string;
  evaluationVersionId?: string;
  modelName?: string;
  modelParams?: unknown;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  cost?: number;
  hallucinationFlag?: boolean;
  successScore?: number;
  userFeedback?: string;
  finalAcceptance?: boolean;
  failureReason?: string;
  sourceArtifacts?: string[];
}): Promise<RunRecordRow> {
  const result = await query<RunRecordRow>(
    `INSERT INTO run_records (
      run_id, user_id, session_id, agent_id, workspace_id, task_id,
      prompt_version_id, context_version_id, retrieval_version_id,
      tooling_version_id, evaluation_version_id,
      model_name, model_params, input_tokens, output_tokens, latency_ms, cost,
      hallucination_flag, success_score, user_feedback, final_acceptance,
      failure_reason, source_artifacts
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
      $18, $19, $20, $21, $22, $23
    )
    RETURNING *`,
    [
      params.runId,
      params.userId,
      params.sessionId,
      params.agentId || null,
      params.workspaceId || null,
      params.taskId || null,
      params.promptVersionId || null,
      params.contextVersionId || null,
      params.retrievalVersionId || null,
      params.toolingVersionId || null,
      params.evaluationVersionId || null,
      params.modelName || null,
      params.modelParams ? JSON.stringify(params.modelParams) : null,
      params.inputTokens || 0,
      params.outputTokens || 0,
      params.latencyMs || 0,
      params.cost || null,
      params.hallucinationFlag || false,
      params.successScore || 0.5,
      params.userFeedback || null,
      params.finalAcceptance || false,
      params.failureReason || null,
      params.sourceArtifacts || null,
    ]
  );
  return result.rows[0];
}

export async function getRunRecordById(
  runId: string,
  userId: number
): Promise<RunRecordRow | null> {
  const result = await query<RunRecordRow>(
    `SELECT * FROM run_records WHERE run_id = $1 AND user_id = $2`,
    [runId, userId]
  );
  return result.rows[0] || null;
}

export async function getRunRecordsBySession(
  sessionId: string,
  userId: number
): Promise<RunRecordRow[]> {
  const result = await query<RunRecordRow>(
    `SELECT * FROM run_records WHERE session_id = $1 AND user_id = $2 ORDER BY created_at LIMIT 500`,
    [sessionId, userId]
  );
  return result.rows;
}

export async function updateRunRecordFeedback(
  runId: string,
  userId: number,
  feedback: 'positive' | 'negative' | 'neutral',
  finalAcceptance?: boolean
): Promise<RunRecordRow | null> {
  const result = await query<RunRecordRow>(
    `UPDATE run_records
     SET user_feedback = $3,
         final_acceptance = COALESCE($4, final_acceptance),
         success_score = CASE
           WHEN $3 = 'positive' THEN LEAST(success_score + 0.1, 1.0)
           WHEN $3 = 'negative' THEN GREATEST(success_score - 0.1, 0.0)
           ELSE success_score
         END
     WHERE run_id = $1 AND user_id = $2
     RETURNING *`,
    [runId, userId, feedback, finalAcceptance]
  );
  return result.rows[0] || null;
}

// ============================================================================
// Prompt Version Operations
// ============================================================================

export interface PromptTemplateRow {
  id: number;
  template_id: string;
  user_id: number;
  name: string;
  description: string | null;
  created_at: Date;
}

export interface PromptVersionRow {
  id: number;
  prompt_version_id: string;
  prompt_template_id: string;
  version_number: number;
  parent_version_id: string | null;
  branch_label: string | null;
  status: string;
  raw_text: string;
  structured_config: unknown;
  system_block: string | null;
  memory_block: string | null;
  retrieval_block: string | null;
  tool_block: string | null;
  output_schema: string | null;
  change_summary: string | null;
  created_by: number | null;
  created_at: Date;
}

export async function insertPromptTemplate(params: {
  templateId: string;
  userId: number;
  name: string;
  description?: string;
}): Promise<PromptTemplateRow> {
  const result = await query<PromptTemplateRow>(
    `INSERT INTO prompt_templates (template_id, user_id, name, description)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [params.templateId, params.userId, params.name, params.description || null]
  );
  return result.rows[0];
}

export async function insertPromptVersion(params: {
  promptVersionId: string;
  promptTemplateId: string;
  versionNumber: number;
  parentVersionId?: string;
  branchLabel?: string;
  status?: string;
  rawText: string;
  structuredConfig?: unknown;
  systemBlock?: string;
  memoryBlock?: string;
  retrievalBlock?: string;
  toolBlock?: string;
  outputSchema?: string;
  changeSummary?: string;
  createdBy?: number;
}): Promise<PromptVersionRow> {
  const result = await query<PromptVersionRow>(
    `INSERT INTO prompt_versions (
      prompt_version_id, prompt_template_id, version_number,
      parent_version_id, branch_label, status,
      raw_text, structured_config,
      system_block, memory_block, retrieval_block, tool_block, output_schema,
      change_summary, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING *`,
    [
      params.promptVersionId,
      params.promptTemplateId,
      params.versionNumber,
      params.parentVersionId || null,
      params.branchLabel || null,
      params.status || 'draft',
      params.rawText,
      params.structuredConfig ? JSON.stringify(params.structuredConfig) : null,
      params.systemBlock || null,
      params.memoryBlock || null,
      params.retrievalBlock || null,
      params.toolBlock || null,
      params.outputSchema || null,
      params.changeSummary || null,
      params.createdBy || null,
    ]
  );
  return result.rows[0];
}

export async function getLatestPromptVersion(
  templateId: string
): Promise<PromptVersionRow | null> {
  const result = await query<PromptVersionRow>(
    `SELECT * FROM prompt_versions
     WHERE prompt_template_id = $1
     ORDER BY version_number DESC
     LIMIT 1`,
    [templateId]
  );
  return result.rows[0] || null;
}

export async function getActivePromptVersion(
  templateId: string
): Promise<PromptVersionRow | null> {
  const result = await query<PromptVersionRow>(
    `SELECT * FROM prompt_versions
     WHERE prompt_template_id = $1 AND status = 'active'
     ORDER BY version_number DESC
     LIMIT 1`,
    [templateId]
  );
  return result.rows[0] || null;
}
