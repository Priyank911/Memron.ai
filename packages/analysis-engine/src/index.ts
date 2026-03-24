/**
 * Memron Analysis Engine
 * Context intelligence and memory orchestration for AI agents
 *
 * @packageDocumentation
 */

// Core types
export * from './types.js';

// Episode splitting
export { splitIntoEpisodes, splitIntoEpisodesSync, summarizeEpisode } from './episode-splitter.js';

// Extractors
export {
  extractMemories,
  extractMemoriesSync,
  calculateCompressionStats,
} from './extractors/atomic-extractor.js';

export {
  extractEntities,
  extractEntitiesSync,
  findRelatedEntities,
} from './extractors/entity-extractor.js';

export {
  extractPreferences,
  extractPreferencesSync,
  preferencesToMemoryContent,
  type ExtractedPreference,
  type PreferenceCategory,
} from './extractors/preference-extractor.js';

// Analyzers
export {
  analyzeTrajectory,
  analyzeTrajectorySync,
  findWinningBranch,
  getTrajectorySimpleSummary,
} from './analyzers/trajectory-analyzer.js';

export {
  detectOutcome,
  detectOutcomeFromMessages,
  getFinalUserSentiment,
  isSuccessfulConversation,
  getOutcomeExplanation,
  type OutcomeDetectionResult,
  type OutcomeSignal,
} from './analyzers/outcome-detector.js';

export {
  detectHallucinations,
  detectHallucinationsSync,
  getHallucinationSummary,
  needsVerification,
  type HallucinationAnalysis,
  type HallucinationIndicator,
  type RiskLevel,
} from './analyzers/hallucination-detector.js';

// Distillers
export {
  distillRecipe,
  distillRecipeSync,
  calculateCompressionRatio,
  mergeRecipes,
  formatRecipeForDisplay,
} from './distillers/recipe-distiller.js';

export {
  compressContent,
  compressContentSync,
  compressBatch,
  getCompressionSummary,
  type CompressionResult,
} from './distillers/compression-optimizer.js';

// Evolution
export {
  detectConflict,
  detectConflictSync,
  suggestResolution,
  findAllConflicts,
  findAllConflictsSync,
} from './evolution/conflict-detector.js';

export {
  applyUpdate,
  mergeMemories,
  resolveConflict,
  processUpdate,
  processBatchUpdates,
  updateConfidence,
  expireMemories,
  getUpdateSummary,
  type UpdateResult,
} from './evolution/memory-updater.js';

// LLM
export { analyze, analyzeBatch, analyzeStream, resetClient } from './llm/groq-client.js';

export * from './llm/prompts.js';

// Pipeline
export {
  runPipeline,
  runPipelineSync,
  quickAnalyze,
  getPipelineSummary,
  type PipelineConfig,
} from './pipeline.js';

// Embeddings
export {
  generateEmbedding,
  generateEmbeddings,
  cosineSimilarity,
  findMostSimilar,
  embedMemory,
  embedRecipe,
  embedEntity,
  embedQuery,
  type EmbeddingConfig,
  type EmbeddingResult,
} from './embeddings/embedding-generator.js';
