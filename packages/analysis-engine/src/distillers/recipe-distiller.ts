/**
 * Recipe Distiller
 * Extracts reusable success recipes from winning conversation paths
 */

import { nanoid } from 'nanoid';
import { analyze } from '../llm/groq-client';
import { RECIPE_DISTILLATION_PROMPT } from '../llm/prompts';
import type {
  Episode,
  EpisodeAnalysis,
  SuccessRecipe,
  RecipeStep,
  FailurePattern,
  ConversationMessage,
} from '../types';

export interface RecipeDistillerConfig {
  minSuccessScore?: number;
  maxRecipeSteps?: number;
  compressionTarget?: number; // Target compression ratio (e.g., 0.2 = 20% of original)
}

interface LLMRecipeResult {
  recipeName: string;
  taskType: string;
  problemStatement: string;
  problemSignature: string;
  approach: RecipeStep[];
  doList: string[];
  dontList: string[];
  prerequisites: string[];
  caveats: string[];
  failurePatterns: FailurePattern[];
  successRate: number;
  avgTokenCost: number;
  transferabilityScore: number;
}

const DEFAULT_CONFIG: Required<RecipeDistillerConfig> = {
  minSuccessScore: 0.7,
  maxRecipeSteps: 10,
  compressionTarget: 0.2,
};

/**
 * Estimate tokens in text
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Generate a semantic hash for problem matching
 */
function generateProblemSignature(problemStatement: string): string {
  // Normalize and extract key terms
  const normalized = problemStatement
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .sort()
    .join('-');

  // Take first 64 chars as signature
  return normalized.slice(0, 64);
}

/**
 * Extract problem statement from episode
 */
function extractProblemStatement(episode: Episode): string {
  // Look for the first user message that defines the goal
  const goalMessage = episode.messages.find(
    (m) => m.role === 'user' && m.content.length > 20
  );

  if (goalMessage) {
    return goalMessage.content.slice(0, 500);
  }

  return `Task from episode: ${episode.episodeType}`;
}

/**
 * Extract approach steps from winning branch
 */
function extractApproachFromMessages(
  messages: ConversationMessage[],
  analysis?: EpisodeAnalysis
): RecipeStep[] {
  const steps: RecipeStep[] = [];
  let stepNum = 1;

  // Find assistant messages that contributed to success
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];

    if (message.role !== 'assistant') continue;

    // Check if this step was part of winning branch (if analysis available)
    if (analysis) {
      const trajectoryPoint = analysis.trajectoryPoints.find((p) => p.index === i);
      if (trajectoryPoint && trajectoryPoint.type === 'dead_end') {
        continue; // Skip dead ends
      }
    }

    // Extract the core action from the message
    const action = extractCoreAction(message.content);
    if (action) {
      steps.push({
        step: stepNum++,
        action,
        rationale: undefined, // Would need LLM to generate
        criticalDetail: undefined,
      });
    }
  }

  return steps;
}

/**
 * Extract the core action from an assistant message
 */
function extractCoreAction(content: string): string | null {
  // Skip very short or very long messages
  if (content.length < 50 || content.length > 5000) {
    return null;
  }

  // Look for action indicators
  const actionPatterns = [
    /\b(let me|i will|i'll|going to)\s+([^.!?\n]+)/i,
    /\b(first|then|next|finally)\s*[,:]?\s*([^.!?\n]+)/i,
    /\b(to (fix|solve|resolve|implement))\s+([^.!?\n]+)/i,
  ];

  for (const pattern of actionPatterns) {
    const match = content.match(pattern);
    if (match) {
      const action = match[2] || match[3] || match[0];
      return action.trim().slice(0, 200);
    }
  }

  // Fall back to first sentence
  const firstSentence = content.match(/^[^.!?\n]+[.!?]?/);
  if (firstSentence && firstSentence[0].length > 20) {
    return firstSentence[0].trim().slice(0, 200);
  }

  return null;
}

/**
 * Extract do/don't lists from episode
 */
function extractGuidanceLists(
  episode: Episode,
  analysis?: EpisodeAnalysis
): { doList: string[]; dontList: string[] } {
  const doList: string[] = [];
  const dontList: string[] = [];

  // Add success criteria as do list
  if (analysis?.successCriteria) {
    doList.push(...analysis.successCriteria);
  }

  // Add failure criteria as don't list
  if (analysis?.failureCriteria) {
    dontList.push(...analysis.failureCriteria.map((f) => `Avoid: ${f}`));
  }

  // Add hallucination indicators as don'ts
  if (analysis?.hallucinationIndicators) {
    dontList.push(
      ...analysis.hallucinationIndicators.map((h) => `Don't assume: ${h}`)
    );
  }

  // Extract from user refinements
  for (const message of episode.messages) {
    if (message.role !== 'user') continue;

    const content = message.content.toLowerCase();

    // Look for explicit dos
    const doMatch = content.match(/\b(make sure|always|must|should)\s+([^.!?\n]+)/i);
    if (doMatch) {
      doList.push(doMatch[2].trim());
    }

    // Look for explicit don'ts
    const dontMatch = content.match(/\b(don't|do not|never|avoid)\s+([^.!?\n]+)/i);
    if (dontMatch) {
      dontList.push(dontMatch[2].trim());
    }
  }

  // Deduplicate
  return {
    doList: [...new Set(doList)].slice(0, 10),
    dontList: [...new Set(dontList)].slice(0, 10),
  };
}

/**
 * Extract failure patterns from episode
 */
function extractFailurePatterns(
  episode: Episode,
  analysis?: EpisodeAnalysis
): FailurePattern[] {
  const patterns: FailurePattern[] = [];

  // Look for retry patterns
  for (const message of episode.messages) {

    if (message.role === 'user') {
      const content = message.content.toLowerCase();

      // Check if user rejected previous response
      if (
        /\b(doesn't work|wrong|not what|try again|that's not)\b/.test(content)
      ) {
        patterns.push({
          pattern: 'User rejection',
          symptom: message.content.slice(0, 100),
          avoidanceRule: 'Verify before proceeding',
        });
      }
    }
  }

  // Add from analysis
  if (analysis?.tokenWastePoints) {
    for (const waste of analysis.tokenWastePoints) {
      patterns.push({
        pattern: 'Token waste',
        symptom: waste,
        avoidanceRule: 'Be more concise',
      });
    }
  }

  return patterns.slice(0, 5);
}

/**
 * Calculate task type from episode
 */
function inferTaskType(episode: Episode): string {
  const content = episode.messages.map((m) => m.content.toLowerCase()).join(' ');

  const taskTypes: Record<string, RegExp[]> = {
    debugging: [/\b(debug|error|fix|bug|issue|crash)\b/],
    implementation: [/\b(implement|create|build|add|develop)\b/],
    refactoring: [/\b(refactor|restructure|reorganize|clean up)\b/],
    optimization: [/\b(optimize|improve|performance|speed|faster)\b/],
    configuration: [/\b(configure|setup|config|settings)\b/],
    documentation: [/\b(document|docs|readme|explain)\b/],
    testing: [/\b(test|testing|unit test|e2e|coverage)\b/],
  };

  for (const [taskType, patterns] of Object.entries(taskTypes)) {
    if (patterns.some((p) => p.test(content))) {
      return taskType;
    }
  }

  return 'general';
}

/**
 * Distill a recipe using LLM
 */
async function distillWithLLM(
  episode: Episode,
  _analysis?: EpisodeAnalysis
): Promise<LLMRecipeResult> {
  const content = episode.messages
    .map((m, i) => `[${i}] ${m.role}: ${m.content.slice(0, 500)}`)
    .join('\n\n');

  const result = await analyze<LLMRecipeResult>(RECIPE_DISTILLATION_PROMPT, content);
  return result.data;
}

/**
 * Distill a success recipe from an episode
 */
export async function distillRecipe(
  episode: Episode,
  analysis?: EpisodeAnalysis,
  config: RecipeDistillerConfig = {}
): Promise<SuccessRecipe | null> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  // Check if episode is successful enough to distill
  if (episode.outcome !== 'success' && episode.outcome !== 'partial') {
    return null;
  }

  const timestamp = new Date().toISOString();
  let recipe: Partial<SuccessRecipe> = {};

  // Try LLM distillation first
  try {
    const llmResult = await distillWithLLM(episode, analysis);

    recipe = {
      recipeId: `rec_${nanoid(12)}`,
      recipeName: llmResult.recipeName,
      taskType: llmResult.taskType,
      problemStatement: llmResult.problemStatement,
      problemSignature: llmResult.problemSignature || generateProblemSignature(llmResult.problemStatement),
      approach: llmResult.approach.slice(0, fullConfig.maxRecipeSteps),
      doList: llmResult.doList,
      dontList: llmResult.dontList,
      prerequisites: llmResult.prerequisites,
      caveats: llmResult.caveats,
      failurePatterns: llmResult.failurePatterns,
      successRate: llmResult.successRate,
      avgTokenCost: llmResult.avgTokenCost,
      transferabilityScore: llmResult.transferabilityScore,
      recipeVersion: 1,
      createdAt: timestamp,
    };
  } catch (error) {
    console.warn('LLM recipe distillation failed, using heuristics:', error);

    // Fall back to heuristic distillation
    const problemStatement = extractProblemStatement(episode);
    const approach = extractApproachFromMessages(episode.messages, analysis);
    const { doList, dontList } = extractGuidanceLists(episode, analysis);
    const failurePatterns = extractFailurePatterns(episode, analysis);
    const taskType = inferTaskType(episode);

    recipe = {
      recipeId: `rec_${nanoid(12)}`,
      recipeName: `${taskType} recipe from ${episode.episodeId}`,
      taskType,
      problemStatement,
      problemSignature: generateProblemSignature(problemStatement),
      approach,
      doList,
      dontList,
      prerequisites: [],
      caveats: [],
      failurePatterns,
      successRate: episode.outcome === 'success' ? 0.8 : 0.5,
      avgTokenCost: approach.reduce((sum, s) => sum + estimateTokens(s.action), 0),
      transferabilityScore: 0.6,
      recipeVersion: 1,
      createdAt: timestamp,
    };
  }

  // Validate recipe quality
  if (!recipe.approach || recipe.approach.length === 0) {
    return null;
  }

  return recipe as SuccessRecipe;
}

/**
 * Distill recipe synchronously using heuristics only
 */
export function distillRecipeSync(
  episode: Episode,
  analysis?: EpisodeAnalysis,
  config: RecipeDistillerConfig = {}
): SuccessRecipe | null {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  if (episode.outcome !== 'success' && episode.outcome !== 'partial') {
    return null;
  }

  const timestamp = new Date().toISOString();
  const problemStatement = extractProblemStatement(episode);
  const approach = extractApproachFromMessages(episode.messages, analysis);
  const { doList, dontList } = extractGuidanceLists(episode, analysis);
  const failurePatterns = extractFailurePatterns(episode, analysis);
  const taskType = inferTaskType(episode);

  if (approach.length === 0) {
    return null;
  }

  return {
    recipeId: `rec_${nanoid(12)}`,
    recipeName: `${taskType} recipe`,
    taskType,
    problemStatement,
    problemSignature: generateProblemSignature(problemStatement),
    approach: approach.slice(0, fullConfig.maxRecipeSteps),
    doList,
    dontList,
    prerequisites: [],
    caveats: [],
    failurePatterns,
    successRate: episode.outcome === 'success' ? 0.8 : 0.5,
    avgTokenCost: approach.reduce((sum, s) => sum + estimateTokens(s.action), 0),
    transferabilityScore: 0.6,
    recipeVersion: 1,
    createdAt: timestamp,
  };
}

/**
 * Calculate compression ratio for a recipe
 */
export function calculateCompressionRatio(
  episode: Episode,
  recipe: SuccessRecipe
): number {
  const originalTokens = episode.messages.reduce(
    (sum, m) => sum + estimateTokens(m.content),
    0
  );

  const recipeTokens =
    estimateTokens(recipe.problemStatement) +
    recipe.approach.reduce((sum, s) => sum + estimateTokens(s.action), 0) +
    recipe.doList.reduce((sum, s) => sum + estimateTokens(s), 0) +
    recipe.dontList.reduce((sum, s) => sum + estimateTokens(s), 0);

  return recipeTokens / originalTokens;
}

/**
 * Merge multiple recipes for the same problem type
 */
export function mergeRecipes(recipes: SuccessRecipe[]): SuccessRecipe | null {
  if (recipes.length === 0) return null;
  if (recipes.length === 1) return recipes[0];

  // Use the highest success rate recipe as base
  const sortedRecipes = [...recipes].sort((a, b) => b.successRate - a.successRate);
  const baseRecipe = sortedRecipes[0];

  // Merge unique steps and guidance
  const allDoList = new Set(recipes.flatMap((r) => r.doList));
  const allDontList = new Set(recipes.flatMap((r) => r.dontList));
  const allFailurePatterns = recipes.flatMap((r) => r.failurePatterns);

  return {
    ...baseRecipe,
    recipeId: `rec_${nanoid(12)}`,
    recipeName: `Merged: ${baseRecipe.recipeName}`,
    doList: [...allDoList].slice(0, 10),
    dontList: [...allDontList].slice(0, 10),
    failurePatterns: allFailurePatterns.slice(0, 10),
    successRate: recipes.reduce((sum, r) => sum + r.successRate, 0) / recipes.length,
    recipeVersion: 1,
    parentRecipeId: baseRecipe.recipeId,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Format recipe for display
 */
export function formatRecipeForDisplay(recipe: SuccessRecipe): string {
  let output = `# ${recipe.recipeName}\n\n`;
  output += `**Task Type:** ${recipe.taskType}\n`;
  output += `**Success Rate:** ${(recipe.successRate * 100).toFixed(0)}%\n\n`;

  output += `## Problem\n${recipe.problemStatement}\n\n`;

  output += `## Approach\n`;
  for (const step of recipe.approach) {
    output += `${step.step}. ${step.action}\n`;
    if (step.rationale) output += `   _Rationale: ${step.rationale}_\n`;
  }
  output += '\n';

  if (recipe.doList.length > 0) {
    output += `## Do\n`;
    for (const item of recipe.doList) {
      output += `- ${item}\n`;
    }
    output += '\n';
  }

  if (recipe.dontList.length > 0) {
    output += `## Don't\n`;
    for (const item of recipe.dontList) {
      output += `- ${item}\n`;
    }
    output += '\n';
  }

  return output;
}
