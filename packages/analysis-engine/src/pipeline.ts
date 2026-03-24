/**
 * Analysis Pipeline
 * Orchestrates the full analysis workflow from conversation to structured output
 */

import { nanoid } from 'nanoid';
import { splitIntoEpisodes, splitIntoEpisodesSync } from './episode-splitter.js';
import { extractMemories, extractMemoriesSync, calculateCompressionStats } from './extractors/atomic-extractor.js';
import { extractEntities, extractEntitiesSync } from './extractors/entity-extractor.js';
import { analyzeTrajectory, analyzeTrajectorySync } from './analyzers/trajectory-analyzer.js';
import { detectOutcome } from './analyzers/outcome-detector.js';
import { detectHallucinationsSync } from './analyzers/hallucination-detector.js';
import { distillRecipe, distillRecipeSync } from './distillers/recipe-distiller.js';
import { findAllConflicts, findAllConflictsSync } from './evolution/conflict-detector.js';
import { processBatchUpdates } from './evolution/memory-updater.js';
import type {
  ConversationMessage,
  Episode,
  AtomicMemoryUnit,
  EpisodeAnalysis,
  SuccessRecipe,
  Entity,
  EntityRelationship,
  AnalysisPipelineInput,
  AnalysisPipelineResult,
} from './types.js';

export interface PipelineConfig {
  useLLM?: boolean;
  parallel?: boolean;
  maxEpisodes?: number;
  maxMemoriesPerEpisode?: number;
}

/**
 * Run promises with concurrency limit
 */
async function promiseAllWithLimit<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function runNext(): Promise<void> {
    while (index < tasks.length) {
      const currentIndex = index++;
      results[currentIndex] = await tasks[currentIndex]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => runNext());
  await Promise.all(workers);
  return results;
}

const DEFAULT_CONFIG: Required<PipelineConfig> = {
  useLLM: true,
  parallel: true,
  maxEpisodes: 50,
  maxMemoriesPerEpisode: 20,
};

/**
 * Estimate tokens in messages
 */
function estimateInputTokens(messages: ConversationMessage[]): number {
  return messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
}

/**
 * Run the full analysis pipeline
 */
export async function runPipeline(
  input: AnalysisPipelineInput,
  config: PipelineConfig = {}
): Promise<AnalysisPipelineResult> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  const options = input.options || {};
  const startTime = Date.now();

  const totalOutputTokens = 0;

  // Step 1: Split into episodes
  const episodes: Episode[] = [];
  if (options.extractEpisodes !== false) {
    const splitEpisodes = fullConfig.useLLM
      ? await splitIntoEpisodes(input.sessionId, input.messages)
      : splitIntoEpisodesSync(input.sessionId, input.messages);

    episodes.push(...splitEpisodes.slice(0, fullConfig.maxEpisodes));
  } else {
    // Treat entire conversation as one episode
    episodes.push({
      episodeId: `ep_${nanoid(12)}`,
      sessionId: input.sessionId,
      episodeType: 'goal_definition',
      startIndex: 0,
      endIndex: input.messages.length,
      messages: input.messages,
      outcome: detectOutcome({ messages: input.messages } as Episode).outcome,
      createdAt: new Date().toISOString(),
    });
  }

  // Step 2: Extract memories from each episode
  const allMemories: AtomicMemoryUnit[] = [];
  if (options.extractMemories !== false) {
    if (fullConfig.parallel && fullConfig.useLLM) {
      const memoryTasks = episodes.map((ep) => () =>
        extractMemories(ep, input.userId, {
          maxMemoriesPerEpisode: fullConfig.maxMemoriesPerEpisode,
        })
      );
      const memoryResults = await promiseAllWithLimit(memoryTasks, 5);
      for (const memories of memoryResults) {
        allMemories.push(...memories);
      }
    } else {
      for (const episode of episodes) {
        const memories = fullConfig.useLLM
          ? await extractMemories(episode, input.userId)
          : extractMemoriesSync(episode, input.userId);
        allMemories.push(...memories);
      }
    }
  }

  // Step 3: Analyze trajectories
  const analyses: EpisodeAnalysis[] = [];
  if (options.analyzeTrajectory !== false) {
    if (fullConfig.parallel && fullConfig.useLLM) {
      const analysisTasks = episodes.map((ep) => () =>
        analyzeTrajectory(ep, { useLLM: fullConfig.useLLM })
      );
      const analysisResults = await promiseAllWithLimit(analysisTasks, 5);
      analyses.push(...analysisResults);
    } else {
      for (const episode of episodes) {
        const analysis = fullConfig.useLLM
          ? await analyzeTrajectory(episode)
          : analyzeTrajectorySync(episode);
        analyses.push(analysis);
      }
    }
  }

  // Step 4: Distill recipes from successful episodes
  const recipes: SuccessRecipe[] = [];
  if (options.distillRecipes !== false) {
    const successfulEpisodes = episodes.filter(
      (ep) => ep.outcome === 'success' || ep.outcome === 'partial'
    );

    for (let i = 0; i < successfulEpisodes.length; i++) {
      const episode = successfulEpisodes[i];
      const analysis = analyses.find((a) => a.episodeId === episode.episodeId);

      const recipe = fullConfig.useLLM
        ? await distillRecipe(episode, analysis)
        : distillRecipeSync(episode, analysis);

      if (recipe) {
        recipes.push(recipe);
      }
    }
  }

  // Step 5: Extract entities
  const allEntities: Entity[] = [];
  const allRelationships: EntityRelationship[] = [];
  if (options.extractEntities !== false) {
    if (fullConfig.parallel && fullConfig.useLLM) {
      const entityTasks = episodes.map((ep) => () =>
        extractEntities(ep, input.userId, { useLLM: fullConfig.useLLM })
      );
      const entityResults = await promiseAllWithLimit(entityTasks, 5);

      for (const { entities, relationships } of entityResults) {
        allEntities.push(...entities);
        allRelationships.push(...relationships);
      }
    } else {
      for (const episode of episodes) {
        const { entities, relationships } = fullConfig.useLLM
          ? await extractEntities(episode, input.userId)
          : extractEntitiesSync(episode, input.userId);

        allEntities.push(...entities);
        allRelationships.push(...relationships);
      }
    }

    // Deduplicate entities by canonical name
    const entityMap = new Map<string, Entity>();
    for (const entity of allEntities) {
      const existing = entityMap.get(entity.canonicalName);
      if (existing) {
        existing.mentionCount += entity.mentionCount;
      } else {
        entityMap.set(entity.canonicalName, entity);
      }
    }
    allEntities.length = 0;
    allEntities.push(...entityMap.values());
  }

  // Step 6: Handle memory evolution (detect conflicts)
  if (allMemories.length > 1) {
    const conflicts = fullConfig.useLLM
      ? await findAllConflicts(allMemories)
      : findAllConflictsSync(allMemories);

    if (conflicts.length > 0) {
      const memoryMap = new Map(allMemories.map((m) => [m.memoryId, m]));
      const results = processBatchUpdates(conflicts, memoryMap);

      // Log evolution results (in production, would store these)
      for (const result of results) {
        if (result.action !== 'skipped') {
          console.log(`Memory evolution: ${result.description}`);
        }
      }
    }
  }

  const processingTimeMs = Date.now() - startTime;

  return {
    sessionId: input.sessionId,
    episodes,
    memories: allMemories,
    analyses,
    recipes,
    entities: allEntities,
    relationships: allRelationships,
    processingStats: {
      inputTokens: estimateInputTokens(input.messages),
      outputTokens: totalOutputTokens,
      episodesFound: episodes.length,
      memoriesExtracted: allMemories.length,
      recipesDistilled: recipes.length,
      entitiesFound: allEntities.length,
      processingTimeMs,
    },
  };
}

/**
 * Run pipeline synchronously (no LLM calls)
 */
export function runPipelineSync(
  input: AnalysisPipelineInput,
  config: Omit<PipelineConfig, 'useLLM' | 'parallel'> = {}
): AnalysisPipelineResult {
  const fullConfig = { ...DEFAULT_CONFIG, ...config, useLLM: false, parallel: false };
  const options = input.options || {};
  const startTime = Date.now();

  // Step 1: Split into episodes
  const episodes: Episode[] = [];
  if (options.extractEpisodes !== false) {
    const splitEpisodes = splitIntoEpisodesSync(input.sessionId, input.messages);
    episodes.push(...splitEpisodes.slice(0, fullConfig.maxEpisodes));
  } else {
    episodes.push({
      episodeId: `ep_${nanoid(12)}`,
      sessionId: input.sessionId,
      episodeType: 'goal_definition',
      startIndex: 0,
      endIndex: input.messages.length,
      messages: input.messages,
      outcome: detectOutcome({ messages: input.messages } as Episode).outcome,
      createdAt: new Date().toISOString(),
    });
  }

  // Step 2: Extract memories
  const allMemories: AtomicMemoryUnit[] = [];
  if (options.extractMemories !== false) {
    for (const episode of episodes) {
      const memories = extractMemoriesSync(episode, input.userId);
      allMemories.push(...memories);
    }
  }

  // Step 3: Analyze trajectories
  const analyses: EpisodeAnalysis[] = [];
  if (options.analyzeTrajectory !== false) {
    for (const episode of episodes) {
      const analysis = analyzeTrajectorySync(episode);
      analyses.push(analysis);
    }
  }

  // Step 4: Distill recipes
  const recipes: SuccessRecipe[] = [];
  if (options.distillRecipes !== false) {
    const successfulEpisodes = episodes.filter(
      (ep) => ep.outcome === 'success' || ep.outcome === 'partial'
    );

    for (const episode of successfulEpisodes) {
      const analysis = analyses.find((a) => a.episodeId === episode.episodeId);
      const recipe = distillRecipeSync(episode, analysis);
      if (recipe) {
        recipes.push(recipe);
      }
    }
  }

  // Step 5: Extract entities
  const allEntities: Entity[] = [];
  const allRelationships: EntityRelationship[] = [];
  if (options.extractEntities !== false) {
    for (const episode of episodes) {
      const { entities, relationships } = extractEntitiesSync(episode, input.userId);
      allEntities.push(...entities);
      allRelationships.push(...relationships);
    }

    // Deduplicate
    const entityMap = new Map<string, Entity>();
    for (const entity of allEntities) {
      const existing = entityMap.get(entity.canonicalName);
      if (existing) {
        existing.mentionCount += entity.mentionCount;
      } else {
        entityMap.set(entity.canonicalName, entity);
      }
    }
    allEntities.length = 0;
    allEntities.push(...entityMap.values());
  }

  // Step 6: Handle memory evolution
  if (allMemories.length > 1) {
    const conflicts = findAllConflictsSync(allMemories);
    if (conflicts.length > 0) {
      const memoryMap = new Map(allMemories.map((m) => [m.memoryId, m]));
      processBatchUpdates(conflicts, memoryMap);
    }
  }

  const processingTimeMs = Date.now() - startTime;

  return {
    sessionId: input.sessionId,
    episodes,
    memories: allMemories,
    analyses,
    recipes,
    entities: allEntities,
    relationships: allRelationships,
    processingStats: {
      inputTokens: estimateInputTokens(input.messages),
      outputTokens: 0,
      episodesFound: episodes.length,
      memoriesExtracted: allMemories.length,
      recipesDistilled: recipes.length,
      entitiesFound: allEntities.length,
      processingTimeMs,
    },
  };
}

/**
 * Quick analysis for immediate feedback
 */
export async function quickAnalyze(
  messages: ConversationMessage[],
  userId: string
): Promise<{
  outcome: string;
  hallucinationRisk: string;
  memoriesExtracted: number;
  compressionRatio: number;
}> {
  const sessionId = `session_${nanoid(8)}`;

  // Quick sync analysis
  const episodes = splitIntoEpisodesSync(sessionId, messages);
  const outcome = detectOutcome(episodes[0] || { messages } as Episode);
  const hallucinations = detectHallucinationsSync(messages);

  let totalMemories = 0;
  let totalOriginalTokens = 0;
  let totalCompressedTokens = 0;

  for (const episode of episodes) {
    const memories = extractMemoriesSync(episode, userId);
    const stats = calculateCompressionStats(episode.messages, memories);

    totalMemories += memories.length;
    totalOriginalTokens += stats.originalTokens;
    totalCompressedTokens += stats.compressedTokens;
  }

  return {
    outcome: outcome.outcome,
    hallucinationRisk: hallucinations.overallRisk,
    memoriesExtracted: totalMemories,
    compressionRatio:
      totalOriginalTokens > 0 ? 1 - totalCompressedTokens / totalOriginalTokens : 0,
  };
}

/**
 * Get pipeline summary
 */
export function getPipelineSummary(result: AnalysisPipelineResult): string {
  const stats = result.processingStats;

  return `Analysis complete:
- ${stats.episodesFound} episodes identified
- ${stats.memoriesExtracted} memories extracted
- ${stats.recipesDistilled} success recipes distilled
- ${stats.entitiesFound} entities found
- Processing time: ${stats.processingTimeMs}ms
- Input tokens: ${stats.inputTokens}`;
}
