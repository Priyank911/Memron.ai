/**
 * Episode Splitter
 * Splits conversations into semantic episodes for structured analysis
 */
import type { ConversationMessage, Episode } from './types';
export interface EpisodeSplitterConfig {
    minEpisodeLength?: number;
    maxEpisodeLength?: number;
    useHeuristics?: boolean;
    useLLM?: boolean;
}
/**
 * Split a conversation into semantic episodes
 */
export declare function splitIntoEpisodes(sessionId: string, messages: ConversationMessage[], config?: EpisodeSplitterConfig): Promise<Episode[]>;
/**
 * Split conversation using heuristics only (no LLM calls)
 */
export declare function splitIntoEpisodesSync(sessionId: string, messages: ConversationMessage[], config?: EpisodeSplitterConfig): Episode[];
/**
 * Generate a summary for an episode
 */
export declare function summarizeEpisode(episode: Episode): Promise<string>;
//# sourceMappingURL=episode-splitter.d.ts.map