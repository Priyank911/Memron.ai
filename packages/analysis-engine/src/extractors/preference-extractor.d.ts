/**
 * Preference Extractor
 * Extracts user preferences from conversations
 */
import type { Episode } from '../types';
export type PreferenceCategory = 'code_style' | 'communication' | 'tooling' | 'quality' | 'process';
export interface ExtractedPreference {
    category: PreferenceCategory;
    preference: string;
    confidence: number;
    source: 'explicit' | 'implicit';
    evidence: string;
}
export interface PreferenceExtractorConfig {
    minConfidence?: number;
    useHeuristics?: boolean;
    useLLM?: boolean;
}
/**
 * Extract preferences from an episode
 */
export declare function extractPreferences(episode: Episode, config?: PreferenceExtractorConfig): Promise<ExtractedPreference[]>;
/**
 * Extract preferences synchronously using heuristics only
 */
export declare function extractPreferencesSync(episode: Episode, config?: PreferenceExtractorConfig): ExtractedPreference[];
/**
 * Convert preferences to memory-friendly format
 */
export declare function preferencesToMemoryContent(preferences: ExtractedPreference[]): string;
//# sourceMappingURL=preference-extractor.d.ts.map