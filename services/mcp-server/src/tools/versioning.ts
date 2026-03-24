/**
 * Versioning Tools
 * Manage prompt versions and run records
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  createTemplate,
  createVersion,
  activateVersion,
  rollbackToVersion,
  getVersionHistory,
  getVersionPerformance,
  compareVersionPerformance,
  getCurrentVersion,
} from '../versioning/prompt-tracker.js';
import {
  recordRun,
  recordFeedback,
  getSessionAnalytics,
  getStatsByPromptVersion,
  getHallucinationPatterns,
  getRun,
} from '../versioning/run-recorder.js';
import { McpError, ErrorCode } from '../lib/errors.js';

// Prompt version schemas
const TemplateCreateSchema = z.object({
  userId: z.number(),
  name: z.string().max(500),
  description: z.string().max(2000).optional(),
});

const VersionCreateSchema = z.object({
  templateId: z.string(),
  rawText: z.string().max(50000),
  systemBlock: z.string().max(50000).optional(),
  memoryBlock: z.string().max(50000).optional(),
  retrievalBlock: z.string().max(50000).optional(),
  toolBlock: z.string().max(50000).optional(),
  outputSchema: z.string().max(10000).optional(),
  parentVersionId: z.string().optional(),
  branchLabel: z.string().optional(),
  changeSummary: z.string().max(2000).optional(),
  createdBy: z.number().optional(),
  activate: z.boolean().optional(),
});

const VersionActivateSchema = z.object({
  templateId: z.string(),
  versionId: z.string(),
});

const VersionHistorySchema = z.object({
  templateId: z.string(),
  limit: z.number().min(1).max(100).optional(),
});

const VersionCompareSchema = z.object({
  versionIdA: z.string(),
  versionIdB: z.string(),
});

const VersionGetSchema = z.object({
  templateId: z.string(),
});

// Run record schemas
const RunRecordSchema = z.object({
  userId: z.number(),
  sessionId: z.string().max(200),
  agentId: z.string().optional(),
  workspaceId: z.string().optional(),
  taskId: z.string().optional(),
  promptVersionId: z.string().optional(),
  contextVersionId: z.string().optional(),
  retrievalVersionId: z.string().optional(),
  modelName: z.string().optional(),
  modelParams: z.record(z.unknown()).optional(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  latencyMs: z.number(),
  cost: z.number().optional(),
  hallucinationFlag: z.boolean().optional(),
  successScore: z.number().min(0).max(1).optional(),
  userFeedback: z.enum(['positive', 'negative', 'neutral']).optional(),
  finalAcceptance: z.boolean().optional(),
  failureReason: z.string().max(2000).optional(),
  sourceArtifacts: z.array(z.string().max(500)).max(50).optional(),
});

const RunFeedbackSchema = z.object({
  userId: z.number(),
  runId: z.string().max(100),
  feedback: z.enum(['positive', 'negative', 'neutral']),
  accepted: z.boolean().optional(),
});

const SessionAnalyticsSchema = z.object({
  userId: z.number(),
  sessionId: z.string().max(200),
});

const PromptStatsSchema = z.object({
  userId: z.number(),
  limit: z.number().min(1).max(50).optional(),
});

const HallucinationPatternsSchema = z.object({
  userId: z.number(),
  limit: z.number().min(1).max(100).optional(),
});

const RunGetSchema = z.object({
  userId: z.number(),
  runId: z.string().max(100),
});

/**
 * Register versioning tools
 */
export function registerVersioningTools(server: McpServer): void {
  // prompt_template_create - Create a new prompt template
  server.tool(
    'prompt_template_create',
    'Create a new prompt template',
    TemplateCreateSchema.shape,
    async (params) => {
      const input = TemplateCreateSchema.parse(params);

      try {
        const template = await createTemplate(
          input.userId,
          input.name,
          input.description
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                templateId: template.template_id,
                name: template.name,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new McpError(
          `Template creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorCode.InternalError,
          500
        );
      }
    }
  );

  // prompt_version_create - Create a new prompt version
  server.tool(
    'prompt_version_create',
    'Create a new version of a prompt template',
    VersionCreateSchema.shape,
    async (params) => {
      const input = VersionCreateSchema.parse(params);

      try {
        const version = await createVersion(
          input.templateId,
          input.rawText,
          {
            systemBlock: input.systemBlock,
            memoryBlock: input.memoryBlock,
            retrievalBlock: input.retrievalBlock,
            toolBlock: input.toolBlock,
            outputSchema: input.outputSchema,
          },
          {
            parentVersionId: input.parentVersionId,
            branchLabel: input.branchLabel,
            changeSummary: input.changeSummary,
            createdBy: input.createdBy,
            status: input.activate ? 'active' : 'draft',
          }
        );

        if (input.activate) {
          await activateVersion(input.templateId, version.prompt_version_id);
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                versionId: version.prompt_version_id,
                versionNumber: version.version_number,
                status: version.status,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new McpError(
          `Version creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorCode.InternalError,
          500
        );
      }
    }
  );

  // prompt_version_activate - Activate a prompt version
  server.tool(
    'prompt_version_activate',
    'Activate a specific prompt version (deactivates others)',
    VersionActivateSchema.shape,
    async (params) => {
      const input = VersionActivateSchema.parse(params);

      try {
        await activateVersion(input.templateId, input.versionId);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                activatedVersionId: input.versionId,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new McpError(
          `Version activation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorCode.InternalError,
          500
        );
      }
    }
  );

  // prompt_version_history - Get version history
  server.tool(
    'prompt_version_history',
    'Get version history for a prompt template',
    VersionHistorySchema.shape,
    async (params) => {
      const input = VersionHistorySchema.parse(params);

      try {
        const history = await getVersionHistory(
          input.templateId,
          input.limit || 20
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                templateId: input.templateId,
                versionCount: history.length,
                versions: history.map(v => ({
                  versionId: v.prompt_version_id,
                  versionNumber: v.version_number,
                  status: v.status,
                  branchLabel: v.branch_label,
                  changeSummary: v.change_summary,
                  createdAt: v.created_at,
                })),
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new McpError(
          `History retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorCode.InternalError,
          500
        );
      }
    }
  );

  // prompt_version_compare - Compare two versions
  server.tool(
    'prompt_version_compare',
    'Compare performance between two prompt versions',
    VersionCompareSchema.shape,
    async (params) => {
      const input = VersionCompareSchema.parse(params);

      try {
        const comparison = await compareVersionPerformance(
          input.versionIdA,
          input.versionIdB
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(comparison, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new McpError(
          `Version comparison failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorCode.InternalError,
          500
        );
      }
    }
  );

  // prompt_version_get - Get current active version
  server.tool(
    'prompt_version_get',
    'Get the current active version of a prompt template',
    VersionGetSchema.shape,
    async (params) => {
      const input = VersionGetSchema.parse(params);

      try {
        const version = await getCurrentVersion(input.templateId);

        if (!version) {
          throw new McpError('No active version found', ErrorCode.NotFound, 404);
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(version, null, 2),
            },
          ],
        };
      } catch (error) {
        if (error instanceof McpError) throw error;
        throw new McpError(
          `Version retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorCode.InternalError,
          500
        );
      }
    }
  );

  // run_record - Record an execution run
  server.tool(
    'run_record',
    'Log an execution run with metrics and outcome',
    RunRecordSchema.shape,
    async (params) => {
      const input = RunRecordSchema.parse(params);

      try {
        const run = await recordRun(
          {
            userId: input.userId,
            sessionId: input.sessionId,
            agentId: input.agentId,
            workspaceId: input.workspaceId,
            taskId: input.taskId,
          },
          {
            promptVersionId: input.promptVersionId,
            contextVersionId: input.contextVersionId,
            retrievalVersionId: input.retrievalVersionId,
          },
          {
            modelName: input.modelName,
            modelParams: input.modelParams,
            inputTokens: input.inputTokens,
            outputTokens: input.outputTokens,
            latencyMs: input.latencyMs,
            cost: input.cost,
          },
          {
            hallucinationFlag: input.hallucinationFlag,
            successScore: input.successScore,
            userFeedback: input.userFeedback,
            finalAcceptance: input.finalAcceptance,
            failureReason: input.failureReason,
          },
          input.sourceArtifacts
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                runId: run.run_id,
                sessionId: run.session_id,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new McpError(
          `Run recording failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorCode.InternalError,
          500
        );
      }
    }
  );

  // run_feedback - Add feedback to a run
  server.tool(
    'run_feedback',
    'Add user feedback to an execution run',
    RunFeedbackSchema.shape,
    async (params) => {
      const input = RunFeedbackSchema.parse(params);

      try {
        const updated = await recordFeedback(
          input.runId,
          input.userId,
          input.feedback,
          input.accepted
        );

        if (!updated) {
          throw new McpError('Run not found', ErrorCode.NotFound, 404);
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                runId: input.runId,
                feedback: input.feedback,
                newSuccessScore: updated.success_score,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        if (error instanceof McpError) throw error;
        throw new McpError(
          `Feedback recording failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorCode.InternalError,
          500
        );
      }
    }
  );

  // run_session_analytics - Get session analytics
  server.tool(
    'run_session_analytics',
    'Get analytics for a session',
    SessionAnalyticsSchema.shape,
    async (params) => {
      const input = SessionAnalyticsSchema.parse(params);

      try {
        const analytics = await getSessionAnalytics(
          input.sessionId,
          input.userId
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                sessionId: input.sessionId,
                ...analytics,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new McpError(
          `Analytics retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorCode.InternalError,
          500
        );
      }
    }
  );

  // run_prompt_stats - Get stats by prompt version
  server.tool(
    'run_prompt_stats',
    'Get aggregated run statistics by prompt version',
    PromptStatsSchema.shape,
    async (params) => {
      const input = PromptStatsSchema.parse(params);

      try {
        const stats = await getStatsByPromptVersion(
          input.userId,
          input.limit || 10
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                versionCount: stats.length,
                versions: stats,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new McpError(
          `Stats retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorCode.InternalError,
          500
        );
      }
    }
  );

  // run_hallucinations - Get hallucination patterns
  server.tool(
    'run_hallucinations',
    'Get recent hallucination patterns from runs',
    HallucinationPatternsSchema.shape,
    async (params) => {
      const input = HallucinationPatternsSchema.parse(params);

      try {
        const patterns = await getHallucinationPatterns(
          input.userId,
          input.limit || 20
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                count: patterns.length,
                patterns,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new McpError(
          `Pattern retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorCode.InternalError,
          500
        );
      }
    }
  );

  // run_get - Get a specific run
  server.tool(
    'run_get',
    'Get details of a specific execution run',
    RunGetSchema.shape,
    async (params) => {
      const input = RunGetSchema.parse(params);

      try {
        const run = await getRun(input.runId, input.userId);

        if (!run) {
          throw new McpError('Run not found', ErrorCode.NotFound, 404);
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(run, null, 2),
            },
          ],
        };
      } catch (error) {
        if (error instanceof McpError) throw error;
        throw new McpError(
          `Run retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ErrorCode.InternalError,
          500
        );
      }
    }
  );
}
