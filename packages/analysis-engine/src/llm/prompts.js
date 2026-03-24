/**
 * LLM Prompts for Analysis Engine
 * Structured prompts for Groq/LLM analysis tasks
 */
export const EPISODE_SPLITTING_PROMPT = `You are analyzing a conversation between a user and an AI assistant to identify semantic episode boundaries.

An episode is a coherent unit of interaction with a specific purpose. Episodes should be split at these boundaries:
- Goal definition: User states what they want to achieve
- Failed attempt: Assistant makes an attempt that doesn't work
- Correction: User or assistant corrects a previous mistake
- User clarification: User provides additional context or requirements
- Tool result: External tool execution and its outcome
- Final solution: The accepted, working solution
- Context setup: Initial context sharing or environment setup
- Exploration: Information gathering or investigation

For each boundary, provide:
1. The message index where the new episode begins
2. The type of episode starting at that boundary
3. A brief reason for the split
4. Confidence score (0-1)

Return JSON in this format:
{
  "boundaries": [
    {
      "index": 0,
      "episodeType": "goal_definition",
      "reason": "User states initial request",
      "confidence": 0.95
    }
  ],
  "totalMessages": <number>
}`;
export const MEMORY_EXTRACTION_PROMPT = `You are extracting atomic memory units from a conversation episode.

For each meaningful piece of information, extract a memory unit with:
- memoryType: One of "fact", "goal", "constraint", "preference", "attempted_action", "observed_failure", "observed_success", "final_resolution"
- content: The full information in context
- compressedContent: A minimal, reusable summary (aim for 80% compression)
- confidence: How certain this information is (0-1)
- successScore: How much this contributed to success (0-1)
- failureScore: How much this contributed to failure (0-1)
- transferability: How useful this would be for future similar tasks (0-1)

Focus on:
- User preferences and constraints
- Technical facts and decisions
- What worked and what didn't
- Patterns that could be reused

Return JSON in this format:
{
  "memories": [
    {
      "memoryType": "preference",
      "content": "User prefers TypeScript with strict mode enabled",
      "compressedContent": "Pref: TypeScript strict mode",
      "confidence": 0.9,
      "successScore": 0.7,
      "failureScore": 0.0,
      "transferability": 0.8,
      "sourceSpan": { "start": 0, "end": 3 }
    }
  ]
}`;
export const TRAJECTORY_ANALYSIS_PROMPT = `Analyze this conversation episode to understand the trajectory toward success or failure.

For each turn, evaluate:
1. Is this a pivotal decision point?
2. Did it move toward success or failure?
3. What specific change made the difference?
4. Where did the agent waste tokens (unnecessary verbosity, repeated information)?
5. Where did it potentially hallucinate (stated facts that weren't established)?

Identify:
- Trajectory points: Key decision moments and their impact
- Step scores: Relevance, novelty, correctness, hallucination risk, user satisfaction signals
- Success criteria: What conditions led to success
- Failure criteria: What conditions led to failure
- Hallucination indicators: Signs of made-up information
- Token waste points: Unnecessarily verbose sections
- Useful user refinements: Corrections that improved the outcome

Return JSON in this format:
{
  "outcome": "success" | "partial" | "failure" | "neutral",
  "outcomeConfidence": 0.85,
  "trajectoryPoints": [
    {
      "index": 2,
      "type": "initial_plan",
      "impact": "positive",
      "summary": "Correctly identified the root cause"
    }
  ],
  "stepScores": [
    {
      "relevance": 0.9,
      "novelty": 0.3,
      "correctness": 0.95,
      "hallucinationRisk": 0.1,
      "userSatisfactionSignal": 0.8,
      "tokenEfficiency": 0.7,
      "transferability": 0.6
    }
  ],
  "successCriteria": ["Clear problem statement", "Iterative testing"],
  "failureCriteria": ["Missing context"],
  "hallucinationIndicators": ["Assumed file structure"],
  "tokenWastePoints": ["Repeated explanation of basic concepts"],
  "usefulUserRefinements": ["Specified the exact error message"]
}`;
export const RECIPE_DISTILLATION_PROMPT = `From this successful conversation, extract a reusable recipe that another agent could follow.

Extract:
1. Problem Statement: What problem was being solved?
2. Problem Signature: A semantic fingerprint for matching similar problems
3. Approach: The sequence of steps that led to success (ignore failed iterations)
4. Do List: What must be done for success
5. Don't List: What must be avoided
6. Prerequisites: What needs to be in place before starting
7. Caveats: Edge cases or warnings
8. Failure Patterns: Common mistakes and how to avoid them

Compress to 10-20% of the original conversation length while preserving all actionable information.

Return JSON in this format:
{
  "recipeName": "Debug TypeScript Type Errors",
  "taskType": "debugging",
  "problemStatement": "User encountered TypeScript type mismatch errors in a React component",
  "problemSignature": "typescript-type-error-react-component",
  "approach": [
    {
      "step": 1,
      "action": "Identify the exact error message and location",
      "rationale": "Pinpoints the source of the type conflict",
      "criticalDetail": "Check both the component props and the parent component"
    }
  ],
  "doList": [
    "Read the full error message carefully",
    "Check the type definitions in the relevant interfaces"
  ],
  "dontList": [
    "Don't use 'any' type to silence errors",
    "Don't modify types without understanding the downstream impact"
  ],
  "prerequisites": [
    "Access to the source code",
    "TypeScript compiler output"
  ],
  "caveats": [
    "Generic types may require explicit type parameters"
  ],
  "failurePatterns": [
    {
      "pattern": "Silencing with 'any'",
      "symptom": "Error disappears but runtime issues occur",
      "avoidanceRule": "Always trace to the actual type mismatch"
    }
  ],
  "successRate": 0.85,
  "avgTokenCost": 450,
  "transferabilityScore": 0.9
}`;
export const ENTITY_EXTRACTION_PROMPT = `Extract named entities and their relationships from this conversation.

Entity types to identify:
- tool: Development tools, CLIs, packages
- api: API endpoints, services
- concept: Technical concepts, patterns
- person: People mentioned
- action: Specific actions taken
- constraint: Limitations, requirements
- technology: Languages, frameworks
- file: File paths, modules
- function: Functions, methods
- error: Error types, exceptions

For relationships, identify:
- uses: One entity uses another
- depends_on: Dependency relationship
- conflicts_with: Incompatibility
- extends: Extension/inheritance
- implements: Implementation relationship
- related_to: General association
- part_of: Composition
- causes: Causal relationship
- solves: Solution relationship

Return JSON in this format:
{
  "entities": [
    {
      "name": "TypeScript",
      "canonicalName": "typescript",
      "entityType": "technology",
      "description": "Typed JavaScript superset"
    }
  ],
  "relationships": [
    {
      "source": "React",
      "target": "TypeScript",
      "relationshipType": "uses",
      "strength": 0.9
    }
  ]
}`;
export const CONFLICT_DETECTION_PROMPT = `Analyze these two memories for potential conflicts or relationships.

Memory 1: {memory1}
Memory 2: {memory2}

Determine:
1. Do these memories contradict each other?
2. Does one update/supersede the other?
3. Does one extend/add detail to the other?
4. Are they independent facts?

If there's a conflict, suggest resolution:
- keep_newer: The newer information is more accurate
- keep_older: The older information should be preserved
- merge: Both contain valuable information that should be combined
- manual_review: Human review needed

Return JSON in this format:
{
  "hasConflict": true | false,
  "conflictType": "contradiction" | "update" | "overlap" | "none",
  "relation": "updates" | "extends" | "contradicts" | "invalidates" | "derives_from" | "independent",
  "resolution": "keep_newer" | "keep_older" | "merge" | "manual_review",
  "confidence": 0.85,
  "evidence": "Memory 2 provides updated preference that supersedes Memory 1",
  "mergedContent": "Optional merged content if resolution is 'merge'"
}`;
export const COMPRESSION_PROMPT = `Compress this content while preserving all essential information for future retrieval.

Original content: {content}

Rules:
1. Preserve all technical specifics (names, numbers, configurations)
2. Preserve causal relationships (X caused Y, X solved Y)
3. Remove redundancy and filler words
4. Use abbreviations where clear (config -> cfg, function -> fn)
5. Maintain context needed for standalone understanding

Target: 20% of original length or less.

Return JSON:
{
  "compressed": "The compressed content",
  "preservedElements": ["List of key elements preserved"],
  "compressionRatio": 0.18
}`;
export const PREFERENCE_EXTRACTION_PROMPT = `Extract user preferences from this conversation.

Look for:
- Explicit preferences ("I prefer X", "I like Y", "Don't use Z")
- Implicit preferences (user corrections, rejections, acceptances)
- Technical preferences (frameworks, patterns, styles)
- Communication preferences (verbosity, format)
- Quality preferences (speed vs accuracy tradeoffs)

Return JSON:
{
  "preferences": [
    {
      "category": "code_style" | "communication" | "tooling" | "quality" | "process",
      "preference": "Prefers concise explanations over detailed ones",
      "confidence": 0.9,
      "source": "explicit" | "implicit",
      "evidence": "User said 'keep it brief'"
    }
  ]
}`;
export const HALLUCINATION_DETECTION_PROMPT = `Analyze this assistant response for potential hallucinations.

A hallucination is:
- Stating specific facts not established in the conversation
- Claiming capabilities or limitations not verified
- Referencing files, functions, or APIs without confirmation
- Making up examples that may not be accurate
- Asserting user intent without explicit confirmation

For each potential hallucination, provide:
- The hallucinated content
- Why it's likely a hallucination
- The risk level (low/medium/high)
- Suggested verification step

Return JSON:
{
  "hallucinations": [
    {
      "content": "The config file is at /etc/app/config.json",
      "reason": "File path was never confirmed by user",
      "riskLevel": "medium",
      "verificationStep": "Ask user to confirm the config file location"
    }
  ],
  "overallRisk": "low" | "medium" | "high",
  "confidence": 0.8
}`;
//# sourceMappingURL=prompts.js.map