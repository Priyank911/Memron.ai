/**
 * Hallucination Detector
 * Detects potential hallucinations in AI responses
 */
import { analyze } from '../llm/groq-client';
import { HALLUCINATION_DETECTION_PROMPT } from '../llm/prompts';
const DEFAULT_CONFIG = {
    useHeuristics: true,
    useLLM: true,
};
/**
 * Patterns that indicate potential hallucinations
 */
const HALLUCINATION_PATTERNS = [
    {
        pattern: /\b(definitely|certainly|always|never|exactly \d+)\b/i,
        reason: 'Absolute certainty without verification',
        riskLevel: 'medium',
        verificationStep: 'Ask for source or verification of this claim',
    },
    {
        pattern: /\b(file|path)\s*[:=]\s*["']?([\/\w\-\.]+)["']?/i,
        reason: 'Specific file path stated without confirmation',
        riskLevel: 'medium',
        verificationStep: 'Verify the file exists at this path',
    },
    {
        pattern: /\b(version|v)\s*[:=]?\s*(\d+\.[\d\.]+)/i,
        reason: 'Specific version number claimed',
        riskLevel: 'low',
        verificationStep: 'Check the actual installed/required version',
    },
    {
        pattern: /\bhttps?:\/\/[^\s]+/i,
        reason: 'URL stated that may not be valid',
        riskLevel: 'medium',
        verificationStep: 'Verify the URL exists and is correct',
    },
    {
        pattern: /\b(api|endpoint)\s*[:=]?\s*["']?([^\s"']+)["']?/i,
        reason: 'API endpoint specified without confirmation',
        riskLevel: 'medium',
        verificationStep: 'Verify the API endpoint is correct',
    },
    {
        pattern: /\b(function|method|class)\s+(\w+)\s+(exists|is available|can be used)/i,
        reason: 'Claims about code existence',
        riskLevel: 'medium',
        verificationStep: 'Check if this function/method/class actually exists',
    },
    {
        pattern: /\b(by default|default(s)? to|out of the box)\b/i,
        reason: 'Assumptions about defaults',
        riskLevel: 'low',
        verificationStep: 'Verify the actual default behavior',
    },
    {
        pattern: /\b(in the (documentation|docs)|according to the docs)\b/i,
        reason: 'References to documentation without citation',
        riskLevel: 'low',
        verificationStep: 'Check the actual documentation',
    },
    {
        pattern: /\b(I remember|as I recall|if I'm not mistaken)\b/i,
        reason: 'Uncertain memory reference',
        riskLevel: 'high',
        verificationStep: 'This indicates uncertainty - verify the claim',
    },
    {
        pattern: /\b(should work|will work|this works)\b/i,
        reason: 'Unverified claim about functionality',
        riskLevel: 'low',
        verificationStep: 'Test to confirm it actually works',
    },
];
/**
 * Patterns that reduce hallucination risk
 */
const GROUNDED_PATTERNS = [
    /\b(based on (the|your) (code|file|input|context))\b/i,
    /\b(from the (error|output|log))\b/i,
    /\b(as you (mentioned|said|showed))\b/i,
    /\b(in the (provided|given) (code|context))\b/i,
];
/**
 * Detect hallucinations using heuristics
 */
function detectWithHeuristics(messages) {
    const indicators = [];
    for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        // Only check assistant messages
        if (message.role !== 'assistant')
            continue;
        const content = message.content;
        // Check for grounding indicators (reduces risk)
        const isGrounded = GROUNDED_PATTERNS.some((p) => p.test(content));
        // Check for hallucination patterns
        for (const { pattern, reason, riskLevel, verificationStep } of HALLUCINATION_PATTERNS) {
            const match = content.match(pattern);
            if (match) {
                // Reduce risk level if grounded
                let adjustedRisk = riskLevel;
                if (isGrounded) {
                    if (riskLevel === 'high')
                        adjustedRisk = 'medium';
                    else if (riskLevel === 'medium')
                        adjustedRisk = 'low';
                }
                indicators.push({
                    content: match[0],
                    reason,
                    riskLevel: adjustedRisk,
                    verificationStep,
                    messageIndex: i,
                });
            }
        }
    }
    return indicators;
}
/**
 * Check if content references established context
 */
function isContextGrounded(content, previousUserMessages) {
    const userContext = previousUserMessages
        .filter((m) => m.role === 'user')
        .map((m) => m.content.toLowerCase())
        .join(' ');
    // Extract potential claims (file paths, names, etc.)
    const fileMatch = content.match(/\b([\w\/\-\.]+\.[a-z]{2,4})\b/gi);
    const nameMatch = content.match(/\b([A-Z][a-z]+[A-Z]\w*)\b/g); // CamelCase names
    if (fileMatch) {
        // Check if files are mentioned in user context
        for (const file of fileMatch) {
            if (userContext.includes(file.toLowerCase())) {
                return true;
            }
        }
    }
    if (nameMatch) {
        // Check if names are mentioned in user context
        for (const name of nameMatch) {
            if (userContext.includes(name.toLowerCase())) {
                return true;
            }
        }
    }
    return false;
}
/**
 * Calculate overall risk from indicators
 */
function calculateOverallRisk(indicators) {
    if (indicators.length === 0)
        return 'low';
    const highCount = indicators.filter((i) => i.riskLevel === 'high').length;
    const mediumCount = indicators.filter((i) => i.riskLevel === 'medium').length;
    if (highCount >= 2 || (highCount >= 1 && mediumCount >= 2)) {
        return 'high';
    }
    if (highCount >= 1 || mediumCount >= 3) {
        return 'medium';
    }
    return 'low';
}
/**
 * Detect hallucinations using LLM
 */
async function detectWithLLM(messages) {
    // Only analyze assistant messages with context
    const content = messages
        .map((m, i) => `[${i}] ${m.role}: ${m.content.slice(0, 500)}`)
        .join('\n\n');
    const result = await analyze(HALLUCINATION_DETECTION_PROMPT, content);
    return result.data;
}
/**
 * Analyze messages for hallucinations
 */
export async function detectHallucinations(messages, config = {}) {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    let indicators = [];
    // Heuristic detection
    if (fullConfig.useHeuristics) {
        indicators = detectWithHeuristics(messages);
    }
    // LLM detection
    if (fullConfig.useLLM) {
        try {
            const llmResult = await detectWithLLM(messages);
            // Merge LLM indicators
            for (const h of llmResult.hallucinations) {
                indicators.push({
                    ...h,
                    messageIndex: -1, // LLM doesn't provide index
                });
            }
        }
        catch (error) {
            console.warn('LLM hallucination detection failed:', error);
        }
    }
    // Deduplicate by content
    const seen = new Set();
    indicators = indicators.filter((i) => {
        const key = i.content.toLowerCase().slice(0, 50);
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
    const overallRisk = calculateOverallRisk(indicators);
    const confidence = indicators.length > 0 ? 0.7 : 0.5;
    return {
        hallucinations: indicators,
        overallRisk,
        confidence,
    };
}
/**
 * Detect hallucinations synchronously using heuristics only
 */
export function detectHallucinationsSync(messages, config = {}) {
    const indicators = detectWithHeuristics(messages);
    const overallRisk = calculateOverallRisk(indicators);
    return {
        hallucinations: indicators,
        overallRisk,
        confidence: 0.6,
    };
}
/**
 * Get a summary of hallucination risk
 */
export function getHallucinationSummary(analysis) {
    if (analysis.hallucinations.length === 0) {
        return 'No significant hallucination indicators detected.';
    }
    const highRisk = analysis.hallucinations.filter((h) => h.riskLevel === 'high');
    const mediumRisk = analysis.hallucinations.filter((h) => h.riskLevel === 'medium');
    let summary = `Overall risk: ${analysis.overallRisk.toUpperCase()}. `;
    summary += `Found ${analysis.hallucinations.length} potential hallucination indicators: `;
    summary += `${highRisk.length} high-risk, ${mediumRisk.length} medium-risk.`;
    if (highRisk.length > 0) {
        summary += `\n\nHigh-risk indicators:\n`;
        summary += highRisk.map((h) => `- ${h.content}: ${h.reason}`).join('\n');
    }
    return summary;
}
/**
 * Check if a specific claim needs verification
 */
export function needsVerification(claim, context) {
    // Check if claim is grounded in user context
    const userContext = context
        .filter((m) => m.role === 'user')
        .map((m) => m.content.toLowerCase())
        .join(' ');
    // Simple check - does the user mention similar content?
    const claimLower = claim.toLowerCase();
    const words = claimLower.split(/\s+/).filter((w) => w.length > 4);
    const matchedWords = words.filter((w) => userContext.includes(w));
    const matchRatio = matchedWords.length / words.length;
    // If less than 50% of significant words match user context, needs verification
    return matchRatio < 0.5;
}
//# sourceMappingURL=hallucination-detector.js.map