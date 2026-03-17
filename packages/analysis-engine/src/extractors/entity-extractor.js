/**
 * Entity Extractor
 * Extracts named entities and relationships from conversations
 */
import { nanoid } from 'nanoid';
import { analyze } from '../llm/groq-client';
import { ENTITY_EXTRACTION_PROMPT } from '../llm/prompts';
const DEFAULT_CONFIG = {
    minMentions: 1,
    useHeuristics: true,
    useLLM: true,
};
/**
 * Common technology patterns for heuristic extraction
 */
const ENTITY_PATTERNS = {
    technology: [
        /\b(TypeScript|JavaScript|Python|Rust|Go|Java|C\+\+|Ruby|PHP|Swift|Kotlin)\b/gi,
        /\b(React|Vue|Angular|Svelte|Next\.js|Nuxt|Remix|Astro)\b/gi,
        /\b(Node\.js|Deno|Bun|Express|Fastify|Koa|NestJS)\b/gi,
        /\b(PostgreSQL|MySQL|MongoDB|Redis|SQLite|Supabase|Firebase)\b/gi,
        /\b(Docker|Kubernetes|AWS|GCP|Azure|Vercel|Railway|Netlify)\b/gi,
    ],
    tool: [
        /\b(npm|pnpm|yarn|bun|cargo|pip|gem|composer)\b/gi,
        /\b(ESLint|Prettier|Vitest|Jest|Mocha|Cypress|Playwright)\b/gi,
        /\b(Git|GitHub|GitLab|Bitbucket)\b/gi,
        /\b(VS Code|Cursor|Vim|Neovim|Emacs)\b/gi,
    ],
    api: [/\b(\w+API|\w+\.api\.\w+|REST|GraphQL|gRPC|WebSocket)\b/gi, /\bhttps?:\/\/[^\s]+/gi],
    file: [
        /\b[\w-]+\.(ts|tsx|js|jsx|py|rs|go|java|rb|php|swift|kt|json|yaml|yml|md|html|css|scss)\b/gi,
        /\b(package\.json|tsconfig\.json|\.env|Dockerfile|docker-compose\.yml)\b/gi,
    ],
    function: [/\b(function|const|let|var|def|fn|func)\s+(\w+)\b/gi, /\b(\w+)\s*\(/g],
    error: [
        /\b(Error|Exception|TypeError|ReferenceError|SyntaxError)\b/gi,
        /\b(failed|error|exception|crash|bug|issue)\b/gi,
    ],
    concept: [
        /\b(authentication|authorization|caching|logging|monitoring|testing|deployment)\b/gi,
        /\b(middleware|component|hook|service|controller|model|view)\b/gi,
    ],
    person: [/@(\w+)\b/g],
    action: [
        /\b(install|create|update|delete|deploy|build|test|run|debug|fix)\b/gi,
        /\b(implementing|refactoring|optimizing|migrating)\b/gi,
    ],
    constraint: [
        /\b(must|should|required|forbidden|limitation|constraint|rule)\b/gi,
        /\b(maximum|minimum|limit|threshold|boundary)\b/gi,
    ],
};
/**
 * Normalize entity name to canonical form
 */
function canonicalize(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
/**
 * Extract entities using heuristic patterns
 */
function extractWithHeuristics(messages) {
    const entities = new Map();
    const fullText = messages.map((m) => m.content).join('\n');
    for (const [entityType, patterns] of Object.entries(ENTITY_PATTERNS)) {
        for (const pattern of patterns) {
            const matches = fullText.matchAll(new RegExp(pattern));
            for (const match of matches) {
                const name = match[1] || match[0];
                const canonical = canonicalize(name);
                if (canonical.length < 2)
                    continue;
                const existing = entities.get(canonical);
                if (existing) {
                    existing.count++;
                }
                else {
                    entities.set(canonical, { name, type: entityType, count: 1 });
                }
            }
        }
    }
    return entities;
}
/**
 * Extract entities using LLM
 */
async function extractWithLLM(messages) {
    const content = messages
        .map((m, i) => `[${i}] ${m.role}: ${m.content.slice(0, 500)}`)
        .join('\n\n');
    const result = await analyze(ENTITY_EXTRACTION_PROMPT, content);
    return result.data;
}
/**
 * Merge heuristic and LLM entities
 */
function mergeEntities(heuristicEntities, llmResult, userId) {
    const merged = new Map();
    const timestamp = new Date().toISOString();
    // Add heuristic entities
    for (const [canonical, data] of heuristicEntities) {
        merged.set(canonical, {
            entityId: `ent_${nanoid(12)}`,
            userId,
            name: data.name,
            canonicalName: canonical,
            entityType: data.type,
            description: undefined,
            firstSeenIn: undefined,
            mentionCount: data.count,
            embedding: undefined,
            createdAt: timestamp,
            updatedAt: timestamp,
        });
    }
    // Merge LLM entities
    for (const entity of llmResult.entities) {
        const canonical = canonicalize(entity.name);
        const existing = merged.get(canonical);
        if (existing) {
            // Update with LLM data (likely higher quality)
            existing.description = entity.description || existing.description;
            existing.entityType = entity.entityType;
        }
        else {
            merged.set(canonical, {
                entityId: `ent_${nanoid(12)}`,
                userId,
                name: entity.name,
                canonicalName: entity.canonicalName || canonical,
                entityType: entity.entityType,
                description: entity.description,
                firstSeenIn: undefined,
                mentionCount: 1,
                embedding: undefined,
                createdAt: timestamp,
                updatedAt: timestamp,
            });
        }
    }
    return Array.from(merged.values());
}
/**
 * Build relationships from LLM result
 */
function buildRelationships(entities, llmResult, userId) {
    const entityMap = new Map(entities.map((e) => [canonicalize(e.name), e]));
    const relationships = [];
    const timestamp = new Date().toISOString();
    for (const rel of llmResult.relationships) {
        const sourceCanonical = canonicalize(rel.source);
        const targetCanonical = canonicalize(rel.target);
        const sourceEntity = entityMap.get(sourceCanonical);
        const targetEntity = entityMap.get(targetCanonical);
        if (sourceEntity && targetEntity) {
            relationships.push({
                id: 0, // Will be assigned by database
                userId,
                sourceEntityId: sourceEntity.entityId,
                targetEntityId: targetEntity.entityId,
                relationshipType: rel.relationshipType,
                strength: rel.strength,
                evidenceCount: 1,
                sourceMemories: [],
                createdAt: timestamp,
            });
        }
    }
    return relationships;
}
/**
 * Extract entities and relationships from an episode
 */
export async function extractEntities(episode, userId, config = {}) {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };
    // Heuristic extraction
    let heuristicEntities = new Map();
    if (fullConfig.useHeuristics) {
        heuristicEntities = extractWithHeuristics(episode.messages);
    }
    // LLM extraction
    let llmResult = { entities: [], relationships: [] };
    if (fullConfig.useLLM) {
        try {
            llmResult = await extractWithLLM(episode.messages);
        }
        catch (error) {
            console.warn('LLM entity extraction failed:', error);
        }
    }
    // Merge and filter
    let entities = mergeEntities(heuristicEntities, llmResult, userId);
    // Filter by minimum mentions
    if (fullConfig.minMentions > 1) {
        entities = entities.filter((e) => e.mentionCount >= fullConfig.minMentions);
    }
    // Build relationships
    const relationships = buildRelationships(entities, llmResult, userId);
    return { entities, relationships };
}
/**
 * Extract entities synchronously using heuristics only
 */
export function extractEntitiesSync(episode, userId, config = {}) {
    const fullConfig = { ...DEFAULT_CONFIG, ...config, useLLM: false };
    const timestamp = new Date().toISOString();
    const heuristicEntities = extractWithHeuristics(episode.messages);
    let entities = Array.from(heuristicEntities.entries())
        .filter(([_, data]) => data.count >= fullConfig.minMentions)
        .map(([canonical, data]) => ({
        entityId: `ent_${nanoid(12)}`,
        userId,
        name: data.name,
        canonicalName: canonical,
        entityType: data.type,
        description: undefined,
        firstSeenIn: undefined,
        mentionCount: data.count,
        embedding: undefined,
        createdAt: timestamp,
        updatedAt: timestamp,
    }));
    // No relationships without LLM
    return { entities, relationships: [] };
}
/**
 * Find related entities by name similarity
 */
export function findRelatedEntities(entity, allEntities, threshold = 0.7) {
    const related = [];
    const canonical = entity.canonicalName;
    for (const other of allEntities) {
        if (other.entityId === entity.entityId)
            continue;
        // Simple substring matching
        if (canonical.includes(other.canonicalName) ||
            other.canonicalName.includes(canonical)) {
            related.push(other);
        }
    }
    return related;
}
//# sourceMappingURL=entity-extractor.js.map