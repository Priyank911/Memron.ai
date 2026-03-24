/**
 * Trajectory Analyzer
 * Analyzes conversation trajectories to understand success/failure patterns
 */

import { analyze } from '../llm/groq-client.js';
import { TRAJECTORY_ANALYSIS_PROMPT } from '../llm/prompts.js';
import type {
  ConversationMessage,
  Episode,
  EpisodeAnalysis,
  TrajectoryPoint,
  TrajectoryPointType,
  ImpactType,
  StepScore,
  OutcomeType,
} from '../types.js';

export interface TrajectoryAnalyzerConfig {
  useHeuristics?: boolean;
  useLLM?: boolean;
  minStepsForAnalysis?: number;
}

interface LLMTrajectoryResult {
  outcome: OutcomeType;
  outcomeConfidence: number;
  trajectoryPoints: TrajectoryPoint[];
  stepScores: StepScore[];
  successCriteria: string[];
  failureCriteria: string[];
  hallucinationIndicators: string[];
  tokenWastePoints: string[];
  usefulUserRefinements: string[];
}

const DEFAULT_CONFIG: Required<TrajectoryAnalyzerConfig> = {
  useHeuristics: true,
  useLLM: true,
  minStepsForAnalysis: 2,
};

/**
 * Heuristic indicators for different trajectory points
 */
const TRAJECTORY_INDICATORS: Record<TrajectoryPointType, RegExp[]> = {
  initial_plan: [
    /\b(let me|i will|first|to start|my approach|plan is)\b/i,
    /\b(here's (how|what)|i'll)\b/i,
  ],
  retry: [
    /\b(let me try|trying again|another approach|alternative)\b/i,
    /\b(didn't work|let's try|instead)\b/i,
  ],
  refinement: [
    /\b(actually|better|improved|updated|refined|modified)\b/i,
    /\b(slight change|adjustment|tweak)\b/i,
  ],
  branch_change: [
    /\b(different approach|completely different|new direction|pivot)\b/i,
    /\b(scratch that|forget that|starting over)\b/i,
  ],
  dead_end: [
    /\b(won't work|impossible|can't|blocked|stuck)\b/i,
    /\b(dead end|no way|not possible)\b/i,
  ],
  winning_branch: [
    /\b(this (works|is it)|perfect|exactly|that's (it|right))\b/i,
    /\b(solved|fixed|done|success)\b/i,
  ],
};

/**
 * Detect trajectory point type from message
 */
function detectTrajectoryPointType(
  message: ConversationMessage,
  messageIndex: number,
  isFirst: boolean
): { type: TrajectoryPointType; confidence: number } | null {
  const content = message.content.toLowerCase();

  if (isFirst && message.role === 'assistant') {
    return { type: 'initial_plan', confidence: 0.8 };
  }

  for (const [pointType, patterns] of Object.entries(TRAJECTORY_INDICATORS) as [
    TrajectoryPointType,
    RegExp[],
  ][]) {
    for (const pattern of patterns) {
      if (pattern.test(content)) {
        return { type: pointType, confidence: 0.7 };
      }
    }
  }

  return null;
}

/**
 * Determine impact of a message
 */
function determineImpact(
  message: ConversationMessage,
  nextMessages: ConversationMessage[]
): ImpactType {
  const nextContent = nextMessages.map((m) => m.content.toLowerCase()).join(' ');

  // Positive indicators
  if (
    /\b(works|success|perfect|great|exactly|solved|fixed)\b/.test(nextContent) &&
    message.role === 'assistant'
  ) {
    return 'positive';
  }

  // Negative indicators
  if (
    /\b(error|failed|wrong|doesn't work|broken|issue)\b/.test(nextContent) &&
    message.role === 'assistant'
  ) {
    return 'negative';
  }

  // Check if user corrects assistant
  if (message.role === 'assistant') {
    const nextUserMessage = nextMessages.find((m) => m.role === 'user');
    if (nextUserMessage) {
      const userContent = nextUserMessage.content.toLowerCase();
      if (/\b(no|wrong|not|actually|but)\b/.test(userContent)) {
        return 'negative';
      }
    }
  }

  return 'neutral';
}

/**
 * Calculate step scores using heuristics
 */
function calculateStepScores(messages: ConversationMessage[]): StepScore[] {
  return messages.map((message, i) => {
    const content = message.content;
    const length = content.length;

    // Relevance: shorter, more focused messages tend to be more relevant
    const relevance = Math.min(1, 200 / Math.max(length, 1));

    // Novelty: first few messages are more novel
    const novelty = Math.max(0, 1 - i * 0.1);

    // Correctness: assume neutral unless we see error indicators
    let correctness = 0.7;
    if (/\b(error|wrong|incorrect|bug)\b/i.test(content)) {
      correctness = 0.3;
    } else if (/\b(works|correct|right|success)\b/i.test(content)) {
      correctness = 0.9;
    }

    // Hallucination risk: increases with specificity without context
    let hallucinationRisk = 0.1;
    if (/\b(definitely|certainly|always|never|exactly \d+)\b/i.test(content)) {
      hallucinationRisk = 0.4;
    }
    if (/\b(file|path|url|api):\s*\S+/i.test(content)) {
      hallucinationRisk = 0.3;
    }

    // User satisfaction: based on user message sentiment
    let userSatisfactionSignal = 0.5;
    if (message.role === 'user') {
      if (/\b(thanks|great|perfect|exactly)\b/i.test(content)) {
        userSatisfactionSignal = 0.9;
      } else if (/\b(no|wrong|not what|try again)\b/i.test(content)) {
        userSatisfactionSignal = 0.2;
      }
    }

    // Token efficiency: penalize very long messages
    const tokenEfficiency = Math.min(1, 500 / Math.max(length, 1));

    // Transferability: higher for general patterns, lower for specific instances
    let transferability = 0.5;
    if (/\b(pattern|approach|strategy|method|technique)\b/i.test(content)) {
      transferability = 0.8;
    }

    return {
      relevance,
      novelty,
      correctness,
      hallucinationRisk,
      userSatisfactionSignal,
      tokenEfficiency,
      transferability,
    };
  });
}

/**
 * Extract trajectory points using heuristics
 */
function extractTrajectoryPointsHeuristic(
  messages: ConversationMessage[]
): TrajectoryPoint[] {
  const points: TrajectoryPoint[] = [];

  for (let i = 0; i < messages.length; i++) {
    const detection = detectTrajectoryPointType(messages[i], i, i === 0);

    if (detection) {
      const impact = determineImpact(messages[i], messages.slice(i + 1));

      points.push({
        index: i,
        type: detection.type,
        impact,
        summary: messages[i].content.slice(0, 100) + '...',
      });
    }
  }

  return points;
}

/**
 * Detect success/failure criteria from messages
 */
function detectCriteria(messages: ConversationMessage[]): {
  successCriteria: string[];
  failureCriteria: string[];
} {
  const successCriteria: string[] = [];
  const failureCriteria: string[] = [];

  for (const message of messages) {
    const content = message.content;

    // Look for explicit success indicators
    if (/\b(works|success|solved|fixed)\b/i.test(content)) {
      // Try to extract what worked
      const match = content.match(/\b(because|since|after|when)\s+([^.!?]+)/i);
      if (match) {
        successCriteria.push(match[2].trim());
      }
    }

    // Look for explicit failure indicators
    if (/\b(failed|error|doesn't work|broken)\b/i.test(content)) {
      const match = content.match(/\b(because|due to|when|after)\s+([^.!?]+)/i);
      if (match) {
        failureCriteria.push(match[2].trim());
      }
    }
  }

  return { successCriteria, failureCriteria };
}

/**
 * Detect token waste in messages
 */
function detectTokenWaste(messages: ConversationMessage[]): string[] {
  const wastePoints: string[] = [];

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];

    // Long assistant messages might be wasteful
    if (message.role === 'assistant' && message.content.length > 2000) {
      wastePoints.push(`Message ${i}: Very long response (${message.content.length} chars)`);
    }

    // Repeated content
    if (i > 0) {
      const prevContent = messages[i - 1].content.toLowerCase();
      const currContent = message.content.toLowerCase();

      // Check for significant overlap
      const words = currContent.split(/\s+/).filter((w) => w.length > 5);
      const repeated = words.filter((w) => prevContent.includes(w));

      if (repeated.length > words.length * 0.5 && words.length > 10) {
        wastePoints.push(`Message ${i}: Repeats previous content`);
      }
    }
  }

  return wastePoints;
}

/**
 * Analyze trajectory using LLM
 */
async function analyzeWithLLM(episode: Episode): Promise<LLMTrajectoryResult> {
  const content = episode.messages
    .map((m, i) => `[${i}] ${m.role}: ${m.content.slice(0, 500)}`)
    .join('\n\n');

  const result = await analyze<LLMTrajectoryResult>(TRAJECTORY_ANALYSIS_PROMPT, content);
  return result.data;
}

/**
 * Analyze an episode's trajectory
 */
export async function analyzeTrajectory(
  episode: Episode,
  config: TrajectoryAnalyzerConfig = {}
): Promise<EpisodeAnalysis> {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };

  // Skip analysis for very short episodes
  if (episode.messages.length < fullConfig.minStepsForAnalysis) {
    return {
      episodeId: episode.episodeId,
      outcome: episode.outcome || 'neutral',
      outcomeConfidence: 0.5,
      trajectoryPoints: [],
      stepScores: [],
      successCriteria: [],
      failureCriteria: [],
      hallucinationIndicators: [],
      tokenWastePoints: [],
      usefulUserRefinements: [],
    };
  }

  // Heuristic analysis
  let heuristicResult: Partial<LLMTrajectoryResult> = {};
  if (fullConfig.useHeuristics) {
    const trajectoryPoints = extractTrajectoryPointsHeuristic(episode.messages);
    const stepScores = calculateStepScores(episode.messages);
    const { successCriteria, failureCriteria } = detectCriteria(episode.messages);
    const tokenWastePoints = detectTokenWaste(episode.messages);

    heuristicResult = {
      outcome: episode.outcome || 'neutral',
      outcomeConfidence: 0.6,
      trajectoryPoints,
      stepScores,
      successCriteria,
      failureCriteria,
      hallucinationIndicators: [],
      tokenWastePoints,
      usefulUserRefinements: [],
    };
  }

  // LLM analysis
  let llmResult: Partial<LLMTrajectoryResult> = {};
  if (fullConfig.useLLM) {
    try {
      llmResult = await analyzeWithLLM(episode);
    } catch (error) {
      console.warn('LLM trajectory analysis failed:', error);
    }
  }

  // Merge results (LLM takes priority when available)
  return {
    episodeId: episode.episodeId,
    outcome: llmResult.outcome || heuristicResult.outcome || 'neutral',
    outcomeConfidence: llmResult.outcomeConfidence || heuristicResult.outcomeConfidence || 0.5,
    trajectoryPoints: llmResult.trajectoryPoints || heuristicResult.trajectoryPoints || [],
    stepScores: llmResult.stepScores || heuristicResult.stepScores || [],
    successCriteria: [
      ...(heuristicResult.successCriteria || []),
      ...(llmResult.successCriteria || []),
    ],
    failureCriteria: [
      ...(heuristicResult.failureCriteria || []),
      ...(llmResult.failureCriteria || []),
    ],
    hallucinationIndicators: llmResult.hallucinationIndicators || [],
    tokenWastePoints: [
      ...(heuristicResult.tokenWastePoints || []),
      ...(llmResult.tokenWastePoints || []),
    ],
    usefulUserRefinements: llmResult.usefulUserRefinements || [],
  };
}

/**
 * Analyze trajectory synchronously using heuristics only
 */
export function analyzeTrajectorySync(
  episode: Episode,
  config: TrajectoryAnalyzerConfig = {}
): EpisodeAnalysis {
  const fullConfig = { ...DEFAULT_CONFIG, ...config, useLLM: false };

  if (episode.messages.length < fullConfig.minStepsForAnalysis) {
    return {
      episodeId: episode.episodeId,
      outcome: episode.outcome || 'neutral',
      outcomeConfidence: 0.5,
      trajectoryPoints: [],
      stepScores: [],
      successCriteria: [],
      failureCriteria: [],
      hallucinationIndicators: [],
      tokenWastePoints: [],
      usefulUserRefinements: [],
    };
  }

  const trajectoryPoints = extractTrajectoryPointsHeuristic(episode.messages);
  const stepScores = calculateStepScores(episode.messages);
  const { successCriteria, failureCriteria } = detectCriteria(episode.messages);
  const tokenWastePoints = detectTokenWaste(episode.messages);

  return {
    episodeId: episode.episodeId,
    outcome: episode.outcome || 'neutral',
    outcomeConfidence: 0.6,
    trajectoryPoints,
    stepScores,
    successCriteria,
    failureCriteria,
    hallucinationIndicators: [],
    tokenWastePoints,
    usefulUserRefinements: [],
  };
}

/**
 * Find the winning trajectory branch
 */
export function findWinningBranch(analysis: EpisodeAnalysis): TrajectoryPoint[] {
  return analysis.trajectoryPoints.filter(
    (p) => p.type === 'winning_branch' || (p.type === 'refinement' && p.impact === 'positive')
  );
}

/**
 * Get trajectory summary
 */
export function getTrajectorySimpleSummary(analysis: EpisodeAnalysis): string {
  const outcomeStr = analysis.outcome.toUpperCase();
  const pivotCount = analysis.trajectoryPoints.filter(
    (p) => p.type === 'branch_change' || p.type === 'retry'
  ).length;
  const deadEnds = analysis.trajectoryPoints.filter((p) => p.type === 'dead_end').length;

  return `Outcome: ${outcomeStr} (${Math.round(analysis.outcomeConfidence * 100)}% confidence). ` +
    `Pivots: ${pivotCount}. Dead ends: ${deadEnds}. ` +
    `Token waste points: ${analysis.tokenWastePoints.length}.`;
}
