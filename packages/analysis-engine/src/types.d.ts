/**
 * Analysis Engine Types
 * Core type definitions for episode decomposition, memory extraction, and analysis
 */
export type EpisodeType = 'goal_definition' | 'failed_attempt' | 'correction' | 'user_clarification' | 'tool_result' | 'final_solution' | 'context_setup' | 'exploration';
export interface ConversationMessage {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    timestamp?: string;
    metadata?: Record<string, unknown>;
    toolName?: string;
    toolResult?: unknown;
}
export interface Episode {
    episodeId: string;
    sessionId: string;
    episodeType: EpisodeType;
    startIndex: number;
    endIndex: number;
    messages: ConversationMessage[];
    summary?: string;
    outcome?: 'success' | 'partial' | 'failure' | 'neutral';
    createdAt: string;
}
export interface EpisodeBoundary {
    index: number;
    reason: string;
    confidence: number;
}
export type MemoryType = 'fact' | 'goal' | 'constraint' | 'preference' | 'attempted_action' | 'observed_failure' | 'observed_success' | 'final_resolution';
export interface EntityLink {
    entityId: string;
    entityName: string;
    entityType: string;
    relationshipType: string;
    strength: number;
}
export interface AtomicMemoryUnit {
    memoryId: string;
    userId: string;
    workspaceId?: string;
    agentId?: string;
    taskId?: string;
    memoryType: MemoryType;
    content: string;
    compressedContent: string;
    confidence: number;
    successScore: number;
    failureScore: number;
    transferability: number;
    timestamp: string;
    eventTime?: string;
    validFrom?: string;
    validTo?: string;
    supersedesMemoryId?: string;
    sourceSpan: {
        start: number;
        end: number;
    };
    graphLinks: EntityLink[];
    sharePolicy: 'private' | 'team' | 'public';
    expiry?: string;
    embedding?: number[];
}
export type OutcomeType = 'success' | 'partial' | 'failure' | 'neutral';
export type TrajectoryPointType = 'initial_plan' | 'retry' | 'refinement' | 'branch_change' | 'dead_end' | 'winning_branch';
export type ImpactType = 'positive' | 'negative' | 'neutral';
export interface TrajectoryPoint {
    index: number;
    type: TrajectoryPointType;
    impact: ImpactType;
    summary: string;
}
export interface StepScore {
    relevance: number;
    novelty: number;
    correctness: number;
    hallucinationRisk: number;
    userSatisfactionSignal: number;
    tokenEfficiency: number;
    transferability: number;
}
export interface EpisodeAnalysis {
    episodeId: string;
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
export interface RecipeStep {
    step: number;
    action: string;
    rationale?: string;
    criticalDetail?: string;
}
export interface FailurePattern {
    pattern: string;
    symptom: string;
    avoidanceRule: string;
}
export interface SuccessRecipe {
    recipeId: string;
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
    recipeVersion: number;
    parentRecipeId?: string;
    userId?: string;
    createdAt: string;
    updatedAt?: string;
}
export interface RunRecord {
    runId: string;
    userId: string;
    agentId: string;
    workspaceId?: string;
    sessionId: string;
    taskId?: string;
    promptVersionId: string;
    contextVersionId: string;
    retrievalVersionId: string;
    toolingVersionId: string;
    evaluationVersionId?: string;
    modelName: string;
    modelParams: Record<string, unknown>;
    inputTokens: number;
    outputTokens: number;
    latencyMs: number;
    cost?: number;
    hallucinationFlag: boolean;
    successScore: number;
    userFeedback?: 'positive' | 'negative' | 'neutral';
    finalAcceptance: boolean;
    failureReason?: string;
    sourceArtifacts: string[];
    createdAt: string;
}
export type PromptStatus = 'draft' | 'active' | 'deprecated' | 'rolled_back';
export interface PromptVersion {
    promptVersionId: string;
    promptTemplateId: string;
    versionNumber: number;
    parentVersionId?: string;
    branchLabel?: string;
    status: PromptStatus;
    rawText: string;
    structuredConfig?: Record<string, unknown>;
    systemBlock?: string;
    memoryBlock?: string;
    retrievalBlock?: string;
    toolBlock?: string;
    outputSchema?: string;
    changeSummary?: string;
    createdBy?: number;
    createdAt: string;
}
export type DiffType = 'clarification' | 'constraint_addition' | 'constraint_removal' | 'decomposition' | 'format_change' | 'tone_change';
export interface PromptDiff {
    diffId: number;
    fromVersionId: string;
    toVersionId: string;
    diffType: DiffType;
    semanticChange: string;
    impactHypothesis?: string;
}
export interface LinkedSource {
    memoryId: string;
    confidence: number;
    relevance: number;
}
export interface TokenUsage {
    total: number;
    budget: number;
    bySection: Record<string, number>;
}
export interface MemoryPacket {
    userPreferences: string[];
    priorSuccessfulRecipe?: SuccessRecipe;
    knownFailuresToAvoid: string[];
    latestFactualUpdates: string[];
    unresolvedSteps: string[];
    linkedSources: LinkedSource[];
    continuationSummary: string;
    warnings: string[];
    tokenUsage: TokenUsage;
}
export type MemoryRelation = 'updates' | 'extends' | 'contradicts' | 'invalidates' | 'derives_from';
export interface MemoryUpdate {
    newMemoryId: string;
    affectedMemoryId: string;
    relation: MemoryRelation;
    confidence: number;
    evidence: string;
}
export interface ConflictResolution {
    conflictId: string;
    memory1Id: string;
    memory2Id: string;
    conflictType: 'contradiction' | 'update' | 'overlap';
    resolution: 'keep_newer' | 'keep_older' | 'merge' | 'manual_review';
    resolvedMemoryId?: string;
    confidence: number;
}
export type EntityType = 'tool' | 'api' | 'concept' | 'person' | 'action' | 'constraint' | 'technology' | 'file' | 'function' | 'error';
export type RelationshipType = 'uses' | 'depends_on' | 'conflicts_with' | 'extends' | 'implements' | 'related_to' | 'part_of' | 'causes' | 'solves';
export interface Entity {
    entityId: string;
    userId: string;
    name: string;
    canonicalName: string;
    entityType: EntityType;
    description?: string;
    firstSeenIn?: string;
    mentionCount: number;
    embedding?: number[];
    createdAt: string;
    updatedAt: string;
}
export interface EntityRelationship {
    id: number;
    userId: string;
    sourceEntityId: string;
    targetEntityId: string;
    relationshipType: RelationshipType;
    strength: number;
    evidenceCount: number;
    sourceMemories: string[];
    createdAt: string;
}
export interface AnalysisPipelineInput {
    sessionId: string;
    userId: string;
    workspaceId?: string;
    messages: ConversationMessage[];
    options?: AnalysisPipelineOptions;
}
export interface AnalysisPipelineOptions {
    extractEpisodes?: boolean;
    extractMemories?: boolean;
    analyzeTrajectory?: boolean;
    distillRecipes?: boolean;
    extractEntities?: boolean;
    generateEmbeddings?: boolean;
}
export interface AnalysisPipelineResult {
    sessionId: string;
    episodes: Episode[];
    memories: AtomicMemoryUnit[];
    analyses: EpisodeAnalysis[];
    recipes: SuccessRecipe[];
    entities: Entity[];
    relationships: EntityRelationship[];
    processingStats: {
        inputTokens: number;
        outputTokens: number;
        episodesFound: number;
        memoriesExtracted: number;
        recipesDistilled: number;
        entitiesFound: number;
        processingTimeMs: number;
    };
}
//# sourceMappingURL=types.d.ts.map