/**
 * Recipe Tools
 * Search, create, and manage success recipes
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import {
  insertRecipe,
  getRecipeById,
  searchRecipes,
  searchRecipesByVector,
  updateRecipeFeedback,
  type RecipeRow,
} from '../db/queries-analysis.js';
import { McpError, ErrorCode } from '../lib/errors.js';

const RecipeSearchSchema = z.object({
  userId: z.number(),
  taskType: z.string().max(200).optional(),
  query: z.string().max(1000).optional(),
  embedding: z.array(z.number()).max(4096).optional(),
  minSuccessRate: z.number().min(0).max(1).optional(),
  limit: z.number().min(1).max(50).optional(),
});

const RecipeCreateSchema = z.object({
  userId: z.number(),
  recipeName: z.string().max(500),
  taskType: z.string().max(200),
  problemStatement: z.string().max(5000),
  approach: z.array(z.object({
    step: z.number(),
    action: z.string().max(2000),
    rationale: z.string().max(2000).optional(),
    criticalDetail: z.string().max(2000).optional(),
  })).max(50),
  doList: z.array(z.string().max(500)).max(20).optional(),
  dontList: z.array(z.string().max(500)).max(20).optional(),
  prerequisites: z.array(z.string().max(500)).max(20).optional(),
  caveats: z.array(z.string().max(500)).max(20).optional(),
  failurePatterns: z.array(z.object({
    pattern: z.string().max(1000),
    symptom: z.string().max(1000).optional(),
    avoidanceRule: z.string().max(1000).optional(),
  })).max(20).optional(),
  workspaceId: z.string().optional(),
});

const RecipeFeedbackSchema = z.object({
  userId: z.number(),
  recipeId: z.string().max(100),
  feedback: z.enum(['positive', 'negative']),
});

const RecipeGetSchema = z.object({
  userId: z.number(),
  recipeId: z.string().max(100),
});

/**
 * Format recipe for display
 */
function formatRecipe(recipe: RecipeRow): object {
  const content = recipe.recipe_content as {
    approach?: unknown[];
    doList?: string[];
    dontList?: string[];
    prerequisites?: string[];
    caveats?: string[];
    failurePatterns?: unknown[];
  };

  return {
    recipeId: recipe.recipe_id,
    name: recipe.recipe_name,
    taskType: recipe.task_type,
    problemStatement: recipe.problem_statement,
    approach: content.approach || [],
    doList: content.doList || [],
    dontList: content.dontList || [],
    prerequisites: content.prerequisites || [],
    caveats: content.caveats || [],
    failurePatterns: content.failurePatterns || [],
    stats: {
      successRate: recipe.success_rate,
      usageCount: recipe.usage_count,
      positiveFeedback: recipe.positive_feedback,
      negativeFeedback: recipe.negative_feedback,
      avgTokenCost: recipe.avg_token_cost,
      transferabilityScore: recipe.transferability_score,
    },
    version: recipe.recipe_version,
    parentRecipeId: recipe.parent_recipe_id,
    createdAt: recipe.created_at,
  };
}

/**
 * Register recipe tools
 */
export function registerRecipeTools(server: McpServer): void {
  // recipe_search - Search for recipes
  server.tool(
    'recipe_search',
    'Search for success recipes by task type, query, or embedding',
    RecipeSearchSchema.shape,
    async (params) => {
      const input = RecipeSearchSchema.parse(params);

      try {
        let recipes: RecipeRow[] = [];

        if (input.embedding) {
          const results = await searchRecipesByVector({
            userId: input.userId,
            embedding: input.embedding,
            limit: input.limit || 10,
          });
          recipes = results;
        } else {
          recipes = await searchRecipes({
            userId: input.userId,
            taskType: input.taskType,
            minSuccessRate: input.minSuccessRate,
            limit: input.limit || 10,
          });
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                count: recipes.length,
                recipes: recipes.map(formatRecipe),
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new McpError(
          `Recipe search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorCode.InternalError,
          500
        );
      }
    }
  );

  // recipe_create - Create a new recipe
  server.tool(
    'recipe_create',
    'Create a new success recipe manually',
    RecipeCreateSchema.shape,
    async (params) => {
      const input = RecipeCreateSchema.parse(params);

      try {
        const recipeId = `recipe_${nanoid(12)}`;

        const recipe = await insertRecipe({
          recipeId,
          userId: input.userId,
          workspaceId: input.workspaceId,
          recipeName: input.recipeName,
          taskType: input.taskType,
          problemStatement: input.problemStatement,
          recipeContent: {
            approach: input.approach,
            doList: input.doList || [],
            dontList: input.dontList || [],
            prerequisites: input.prerequisites || [],
            caveats: input.caveats || [],
            failurePatterns: input.failurePatterns || [],
          },
          successRate: 0.5, // Start neutral
          avgTokenCost: 0,
          transferabilityScore: 0.5,
          recipeVersion: 1,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                recipeId: recipe.recipe_id,
                message: 'Recipe created successfully',
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new McpError(
          `Recipe creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorCode.InternalError,
          500
        );
      }
    }
  );

  // recipe_feedback - Provide feedback on a recipe
  server.tool(
    'recipe_feedback',
    'Mark a recipe as helpful or unhelpful',
    RecipeFeedbackSchema.shape,
    async (params) => {
      const input = RecipeFeedbackSchema.parse(params);

      try {
        const updated = await updateRecipeFeedback(
          input.recipeId,
          input.userId,
          input.feedback
        );

        if (!updated) {
          throw new McpError('Recipe not found', ErrorCode.NotFound, 404);
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                recipeId: input.recipeId,
                feedback: input.feedback,
                newSuccessRate: updated.success_rate,
                totalFeedback: updated.positive_feedback + updated.negative_feedback,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        if (error instanceof McpError) throw error;
        throw new McpError(
          `Feedback submission failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorCode.InternalError,
          500
        );
      }
    }
  );

  // recipe_get - Get a specific recipe
  server.tool(
    'recipe_get',
    'Get a specific recipe by ID',
    RecipeGetSchema.shape,
    async (params) => {
      const input = RecipeGetSchema.parse(params);

      try {
        const recipe = await getRecipeById(input.recipeId, input.userId);

        if (!recipe) {
          throw new McpError('Recipe not found', ErrorCode.NotFound, 404);
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(formatRecipe(recipe), null, 2),
            },
          ],
        };
      } catch (error) {
        if (error instanceof McpError) throw error;
        throw new McpError(
          `Recipe retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorCode.InternalError,
          500
        );
      }
    }
  );
}
