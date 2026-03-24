/**
 * Trajectory Analyzer
 * Analyzes conversation trajectories to understand success/failure patterns
 */
import type { Episode, EpisodeAnalysis, TrajectoryPoint } from '../types';
export interface TrajectoryAnalyzerConfig {
    useHeuristics?: boolean;
    useLLM?: boolean;
    minStepsForAnalysis?: number;
}
/**
 * Analyze an episode's trajectory
 */
export declare function analyzeTrajectory(episode: Episode, config?: TrajectoryAnalyzerConfig): Promise<EpisodeAnalysis>;
/**
 * Analyze trajectory synchronously using heuristics only
 */
export declare function analyzeTrajectorySync(episode: Episode, config?: TrajectoryAnalyzerConfig): EpisodeAnalysis;
/**
 * Find the winning trajectory branch
 */
export declare function findWinningBranch(analysis: EpisodeAnalysis): TrajectoryPoint[];
/**
 * Get trajectory summary
 */
export declare function getTrajectorySimpleSummary(analysis: EpisodeAnalysis): string;
//# sourceMappingURL=trajectory-analyzer.d.ts.map