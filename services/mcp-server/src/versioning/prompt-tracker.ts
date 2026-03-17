/**
 * Prompt Tracker
 * Tracks prompt versions, changes, and their correlation with outcomes
 */

import { nanoid } from 'nanoid';
import {
  insertPromptTemplate,
  insertPromptVersion,
  getLatestPromptVersion,
  getActivePromptVersion,
  type PromptTemplateRow,
  type PromptVersionRow,
} from '../db/queries-analysis.js';
import { query } from '../db/client.js';

export interface PromptComponent {
  systemBlock?: string;
  memoryBlock?: string;
  retrievalBlock?: string;
  toolBlock?: string;
  outputSchema?: string;
}

export interface PromptDiff {
  diffType: 'clarification' | 'constraint_addition' | 'constraint_removal' |
            'decomposition' | 'consolidation' | 'format_change' | 'tone_change' |
            'context_expansion' | 'context_reduction' | 'other';
  semanticChange: string;
  impactHypothesis: string;
}

export interface PromptVersionInfo {
  versionId: string;
  templateId: string;
  versionNumber: number;
  status: 'draft' | 'active' | 'deprecated' | 'rolled_back';
  rawText: string;
  components: PromptComponent;
  changeSummary?: string;
  parentVersionId?: string;
  branchLabel?: string;
}

/**
 * Create a new prompt template
 */
export async function createTemplate(
  userId: number,
  name: string,
  description?: string
): Promise<PromptTemplateRow> {
  const templateId = `tpl_${nanoid(12)}`;
  return insertPromptTemplate({
    templateId,
    userId,
    name,
    description,
  });
}

/**
 * Create a new prompt version
 */
export async function createVersion(
  templateId: string,
  rawText: string,
  components: PromptComponent,
  options: {
    parentVersionId?: string;
    branchLabel?: string;
    changeSummary?: string;
    createdBy?: number;
    status?: 'draft' | 'active';
  } = {}
): Promise<PromptVersionRow> {
  // Get next version number
  const latest = await getLatestPromptVersion(templateId);
  const versionNumber = (latest?.version_number || 0) + 1;

  const versionId = `pv_${nanoid(12)}`;

  return insertPromptVersion({
    promptVersionId: versionId,
    promptTemplateId: templateId,
    versionNumber,
    parentVersionId: options.parentVersionId,
    branchLabel: options.branchLabel,
    status: options.status || 'draft',
    rawText,
    systemBlock: components.systemBlock,
    memoryBlock: components.memoryBlock,
    retrievalBlock: components.retrievalBlock,
    toolBlock: components.toolBlock,
    outputSchema: components.outputSchema,
    changeSummary: options.changeSummary,
    createdBy: options.createdBy,
  });
}

/**
 * Activate a prompt version (deactivate others in the template)
 */
export async function activateVersion(
  templateId: string,
  versionId: string
): Promise<void> {
  // Deactivate all other versions
  await query(
    `UPDATE prompt_versions
     SET status = 'deprecated'
     WHERE prompt_template_id = $1 AND status = 'active'`,
    [templateId]
  );

  // Activate the specified version
  await query(
    `UPDATE prompt_versions
     SET status = 'active'
     WHERE prompt_version_id = $1`,
    [versionId]
  );
}

/**
 * Roll back to a previous version
 */
export async function rollbackToVersion(
  templateId: string,
  targetVersionId: string
): Promise<PromptVersionRow> {
  // Get the target version
  const result = await query<PromptVersionRow>(
    `SELECT * FROM prompt_versions WHERE prompt_version_id = $1`,
    [targetVersionId]
  );
  const targetVersion = result.rows[0];

  if (!targetVersion) {
    throw new Error(`Version ${targetVersionId} not found`);
  }

  // Mark current active as rolled back
  const currentActive = await getActivePromptVersion(templateId);
  if (currentActive) {
    await query(
      `UPDATE prompt_versions SET status = 'rolled_back' WHERE prompt_version_id = $1`,
      [currentActive.prompt_version_id]
    );
  }

  // Create a new version based on the target
  return createVersion(
    templateId,
    targetVersion.raw_text,
    {
      systemBlock: targetVersion.system_block || undefined,
      memoryBlock: targetVersion.memory_block || undefined,
      retrievalBlock: targetVersion.retrieval_block || undefined,
      toolBlock: targetVersion.tool_block || undefined,
      outputSchema: targetVersion.output_schema || undefined,
    },
    {
      parentVersionId: targetVersionId,
      changeSummary: `Rollback to version ${targetVersion.version_number}`,
      status: 'active',
    }
  );
}

/**
 * Record a semantic diff between two prompt versions
 */
export async function recordDiff(
  fromVersionId: string,
  toVersionId: string,
  diff: PromptDiff
): Promise<void> {
  await query(
    `INSERT INTO prompt_diffs (from_version_id, to_version_id, diff_type, semantic_change, impact_hypothesis)
     VALUES ($1, $2, $3, $4, $5)`,
    [fromVersionId, toVersionId, diff.diffType, diff.semanticChange, diff.impactHypothesis]
  );
}

/**
 * Analyze differences between two prompt versions
 */
export function analyzeDiff(
  oldVersion: PromptVersionRow,
  newVersion: PromptVersionRow
): PromptDiff {
  const oldLength = oldVersion.raw_text.length;
  const newLength = newVersion.raw_text.length;
  const lengthDiff = newLength - oldLength;

  // Simple heuristic analysis
  let diffType: PromptDiff['diffType'] = 'other';
  let semanticChange = '';
  let impactHypothesis = '';

  if (Math.abs(lengthDiff) < 50) {
    diffType = 'clarification';
    semanticChange = 'Minor wording adjustments';
    impactHypothesis = 'Subtle improvement in clarity, minimal impact expected';
  } else if (lengthDiff > 200) {
    if (newVersion.raw_text.includes('must') || newVersion.raw_text.includes('always') ||
        newVersion.raw_text.includes('never') || newVersion.raw_text.includes('required')) {
      diffType = 'constraint_addition';
      semanticChange = 'Added explicit constraints or requirements';
      impactHypothesis = 'More constrained outputs, potentially higher precision';
    } else {
      diffType = 'context_expansion';
      semanticChange = 'Expanded context or instructions';
      impactHypothesis = 'More comprehensive guidance, may improve complex tasks';
    }
  } else if (lengthDiff < -200) {
    diffType = 'context_reduction';
    semanticChange = 'Reduced or simplified instructions';
    impactHypothesis = 'Leaner prompt, faster processing, may lose nuance';
  } else if (oldVersion.output_schema !== newVersion.output_schema) {
    diffType = 'format_change';
    semanticChange = 'Modified output format or schema';
    impactHypothesis = 'Different output structure, may affect downstream parsing';
  }

  return { diffType, semanticChange, impactHypothesis };
}

/**
 * Get version history for a template
 */
export async function getVersionHistory(
  templateId: string,
  limit: number = 20
): Promise<PromptVersionRow[]> {
  const result = await query<PromptVersionRow>(
    `SELECT * FROM prompt_versions
     WHERE prompt_template_id = $1
     ORDER BY version_number DESC
     LIMIT $2`,
    [templateId, limit]
  );
  return result.rows;
}

/**
 * Get version performance stats (correlation with run outcomes)
 */
export async function getVersionPerformance(
  versionId: string
): Promise<{
  totalRuns: number;
  avgSuccessScore: number;
  hallucinationRate: number;
  acceptanceRate: number;
  avgLatencyMs: number;
  avgTokenCost: number;
}> {
  const result = await query<{
    total_runs: string;
    avg_success_score: string | null;
    hallucination_rate: string | null;
    acceptance_rate: string | null;
    avg_latency_ms: string | null;
    avg_token_cost: string | null;
  }>(
    `SELECT
       COUNT(*) as total_runs,
       AVG(success_score) as avg_success_score,
       AVG(CASE WHEN hallucination_flag THEN 1 ELSE 0 END) as hallucination_rate,
       AVG(CASE WHEN final_acceptance THEN 1 ELSE 0 END) as acceptance_rate,
       AVG(latency_ms) as avg_latency_ms,
       AVG(input_tokens + output_tokens) as avg_token_cost
     FROM run_records
     WHERE prompt_version_id = $1`,
    [versionId]
  );

  const stats = result.rows[0];
  return {
    totalRuns: parseInt(stats.total_runs || '0', 10),
    avgSuccessScore: parseFloat(stats.avg_success_score || '0'),
    hallucinationRate: parseFloat(stats.hallucination_rate || '0'),
    acceptanceRate: parseFloat(stats.acceptance_rate || '0'),
    avgLatencyMs: parseFloat(stats.avg_latency_ms || '0'),
    avgTokenCost: parseFloat(stats.avg_token_cost || '0'),
  };
}

/**
 * Compare performance between two versions
 */
export async function compareVersionPerformance(
  versionIdA: string,
  versionIdB: string
): Promise<{
  versionA: Awaited<ReturnType<typeof getVersionPerformance>>;
  versionB: Awaited<ReturnType<typeof getVersionPerformance>>;
  recommendation: 'keep_a' | 'keep_b' | 'inconclusive';
  reasoning: string;
}> {
  const [perfA, perfB] = await Promise.all([
    getVersionPerformance(versionIdA),
    getVersionPerformance(versionIdB),
  ]);

  // Need minimum runs for statistical significance
  const minRuns = 10;
  if (perfA.totalRuns < minRuns || perfB.totalRuns < minRuns) {
    return {
      versionA: perfA,
      versionB: perfB,
      recommendation: 'inconclusive',
      reasoning: `Insufficient data: A has ${perfA.totalRuns} runs, B has ${perfB.totalRuns} runs (minimum ${minRuns} required)`,
    };
  }

  // Calculate composite score
  const scoreA = (perfA.avgSuccessScore * 0.4) +
                 (perfA.acceptanceRate * 0.3) +
                 ((1 - perfA.hallucinationRate) * 0.3);
  const scoreB = (perfB.avgSuccessScore * 0.4) +
                 (perfB.acceptanceRate * 0.3) +
                 ((1 - perfB.hallucinationRate) * 0.3);

  const diff = scoreB - scoreA;
  const threshold = 0.05; // 5% difference needed

  if (diff > threshold) {
    return {
      versionA: perfA,
      versionB: perfB,
      recommendation: 'keep_b',
      reasoning: `Version B outperforms A by ${(diff * 100).toFixed(1)}% composite score`,
    };
  } else if (diff < -threshold) {
    return {
      versionA: perfA,
      versionB: perfB,
      recommendation: 'keep_a',
      reasoning: `Version A outperforms B by ${(-diff * 100).toFixed(1)}% composite score`,
    };
  }

  return {
    versionA: perfA,
    versionB: perfB,
    recommendation: 'inconclusive',
    reasoning: `Difference of ${Math.abs(diff * 100).toFixed(1)}% is below threshold`,
  };
}

/**
 * Get the current active version info
 */
export async function getCurrentVersion(
  templateId: string
): Promise<PromptVersionInfo | null> {
  const version = await getActivePromptVersion(templateId);
  if (!version) return null;

  return {
    versionId: version.prompt_version_id,
    templateId: version.prompt_template_id,
    versionNumber: version.version_number,
    status: version.status as PromptVersionInfo['status'],
    rawText: version.raw_text,
    components: {
      systemBlock: version.system_block || undefined,
      memoryBlock: version.memory_block || undefined,
      retrievalBlock: version.retrieval_block || undefined,
      toolBlock: version.tool_block || undefined,
      outputSchema: version.output_schema || undefined,
    },
    changeSummary: version.change_summary || undefined,
    parentVersionId: version.parent_version_id || undefined,
    branchLabel: version.branch_label || undefined,
  };
}
