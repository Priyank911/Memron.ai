/**
 * Recipe Distiller
 * Extracts reusable success recipes from winning conversation paths
 */
import type { Episode, EpisodeAnalysis, SuccessRecipe } from '../types';
export interface RecipeDistillerConfig {
    minSuccessScore?: number;
    maxRecipeSteps?: number;
    compressionTarget?: number;
}
/**
 * Distill a success recipe from an episode
 */
export declare function distillRecipe(episode: Episode, analysis?: EpisodeAnalysis, config?: RecipeDistillerConfig): Promise<SuccessRecipe | null>;
/**
 * Distill recipe synchronously using heuristics only
 */
export declare function distillRecipeSync(episode: Episode, analysis?: EpisodeAnalysis, config?: RecipeDistillerConfig): SuccessRecipe | null;
/**
 * Calculate compression ratio for a recipe
 */
export declare function calculateCompressionRatio(episode: Episode, recipe: SuccessRecipe): number;
/**
 * Merge multiple recipes for the same problem type
 */
export declare function mergeRecipes(recipes: SuccessRecipe[]): SuccessRecipe | null;
/**
 * Format recipe for display
 */
export declare function formatRecipeForDisplay(recipe: SuccessRecipe): string;
//# sourceMappingURL=recipe-distiller.d.ts.map