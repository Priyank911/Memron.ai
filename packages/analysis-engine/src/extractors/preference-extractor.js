/**
 * Preference Extractor
 * Extracts user preferences from conversations
 */
import { analyze } from '../llm/groq-client';
import { PREFERENCE_EXTRACTION_PROMPT } from '../llm/prompts';
const DEFAULT_CONFIG = {
    minConfidence: 0.6,
    useHeuristics: true,
    useLLM: true,
};
/**
 * Heuristic patterns for preference detection
 */
const PREFERENCE_PATTERNS = {
    code_style: [
        /\b(i prefer|use|always use|don't use)\s+(tabs|spaces|semicolons|single quotes|double quotes)/i,
        /\b(camelCase|snake_case|PascalCase|kebab-case)\b/i,
        /\b(functional|class-based|object-oriented)\b/i,
        /\b(strict mode|strict type|any type)\b/i,
    ],
    communication: [
        /\b(keep it (brief|short|concise)|be (verbose|detailed|thorough))/i,
        /\b(explain|don't explain|just (code|give me))/i,
        /\b(step by step|all at once|incrementally)/i,
    ],
    tooling: [
        /\b(i use|we use|prefer using)\s+(\w+)/i,
        /\b(npm|pnpm|yarn|bun)\b/i,
        /\b(VS Code|Cursor|Vim|Neovim)\b/i,
    ],
    quality: [
        /\b(prioritize|focus on)\s+(speed|accuracy|readability|performance)/i,
        /\b(quick and dirty|production ready|thoroughly tested)/i,
        /\b(optimize for|don't worry about)\b/i,
    ],
    process: [
        /\b(test first|tdd|write tests|no tests needed)/i,
        /\b(commit (often|frequently)|single commit)/i,
        /\b(review|no review|approval)\b/i,
    ],
};
/**
 * Extract preferences using heuristic patterns
 */
function extractWithHeuristics(messages) {
    const preferences = [];
    for (const message of messages) {
        if (message.role !== 'user')
            continue;
        const content = message.content;
        for (const [category, patterns] of Object.entries(PREFERENCE_PATTERNS)) {
            for (const pattern of patterns) {
                const match = content.match(pattern);
                if (match) {
                    preferences.push({
                        category,
                        preference: match[0],
                        confidence: 0.7,
                        source: 'explicit',
                        evidence: content.slice(0, 200),
                    });
                }
            }
        }
    }
    return preferences;
}
/**
 * Detect implicit preferences from user corrections
 */
function detectImplicitPreferences(messages) {
    const preferences = [];
    for (let i = 1; i < messages.length; i++) {
        const current = messages[i];
        const previous = messages[i - 1];
        if (current.role !== 'user' || previous.role !== 'assistant')
            continue;
        const content = current.content.toLowerCase();
        // Detect corrections
        if (content.includes('actually') ||
            content.includes('no,') ||
            content.includes('not quite') ||
            content.includes("that's not")) {
            // Look for what they're correcting
            if (content.includes('shorter') || content.includes('brief')) {
                preferences.push({
                    category: 'communication',
                    preference: 'Prefers shorter, more concise responses',
                    confidence: 0.75,
                    source: 'implicit',
                    evidence: content.slice(0, 200),
                });
            }
            if (content.includes('longer') || content.includes('more detail')) {
                preferences.push({
                    category: 'communication',
                    preference: 'Prefers more detailed explanations',
                    confidence: 0.75,
                    source: 'implicit',
                    evidence: content.slice(0, 200),
                });
            }
            if (content.includes("don't use") || content.includes('avoid')) {
                const avoidMatch = content.match(/(?:don't use|avoid)\s+(\w+)/i);
                if (avoidMatch) {
                    preferences.push({
                        category: 'tooling',
                        preference: `Avoids using ${avoidMatch[1]}`,
                        confidence: 0.8,
                        source: 'implicit',
                        evidence: content.slice(0, 200),
                    });
                }
            }
        }
        // Detect positive feedback
        if (content.includes('perfect') ||
            content.includes('exactly') ||
            content.includes('great')) {
            // This indicates the previous approach was good
            // We could extract what made it good, but that requires more context
        }
    }
    return preferences;
}
/**
 * Extract preferences using LLM
 */
async function extractWithLLM(messages) {
    const content = messages
        .map((m, i) => `[${i}] ${m.role}: ${m.content.slice(0, 500)}`)
        .join('\n\n');
    const result = await analyze(PREFERENCE_EXTRACTION_PROMPT, content);
    return result.data.preferences;
}
/**
 * Merge and deduplicate preferences
 */
function mergePreferences(...sources) {
    const merged = new Map();
    for (const preferences of sources) {
        for (const pref of preferences) {
            const key = `${pref.category}:${pref.preference.toLowerCase().slice(0, 50)}`;
            const existing = merged.get(key);
            if (!existing || pref.confidence > existing.confidence) {
                merged.set(key, pref);
            }
        }
    }
    return Array.from(merged.values());
}
/**
 * Extract preferences from an episode
 */
export async function extractPreferences(episode, config = {}) {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    const sources = [];
    // Heuristic extraction
    if (fullConfig.useHeuristics) {
        sources.push(extractWithHeuristics(episode.messages));
        sources.push(detectImplicitPreferences(episode.messages));
    }
    // LLM extraction
    if (fullConfig.useLLM) {
        try {
            const llmPrefs = await extractWithLLM(episode.messages);
            sources.push(llmPrefs);
        }
        catch (error) {
            console.warn('LLM preference extraction failed:', error);
        }
    }
    // Merge and filter
    const merged = mergePreferences(...sources);
    return merged.filter((p) => p.confidence >= fullConfig.minConfidence);
}
/**
 * Extract preferences synchronously using heuristics only
 */
export function extractPreferencesSync(episode, config = {}) {
    const fullConfig = { ...DEFAULT_CONFIG, ...config, useLLM: false };
    const heuristic = extractWithHeuristics(episode.messages);
    const implicit = detectImplicitPreferences(episode.messages);
    const merged = mergePreferences(heuristic, implicit);
    return merged.filter((p) => p.confidence >= fullConfig.minConfidence);
}
/**
 * Convert preferences to memory-friendly format
 */
export function preferencesToMemoryContent(preferences) {
    return preferences
        .map((p) => `[${p.category}] ${p.preference} (confidence: ${p.confidence})`)
        .join('\n');
}
//# sourceMappingURL=preference-extractor.js.map