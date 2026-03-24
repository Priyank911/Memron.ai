/**
 * Entity Extractor
 * Extracts named entities and relationships from conversations
 */
import type { Episode, Entity, EntityRelationship } from '../types';
export interface EntityExtractorConfig {
    minMentions?: number;
    useHeuristics?: boolean;
    useLLM?: boolean;
}
/**
 * Extract entities and relationships from an episode
 */
export declare function extractEntities(episode: Episode, userId: string, config?: EntityExtractorConfig): Promise<{
    entities: Entity[];
    relationships: EntityRelationship[];
}>;
/**
 * Extract entities synchronously using heuristics only
 */
export declare function extractEntitiesSync(episode: Episode, userId: string, config?: EntityExtractorConfig): {
    entities: Entity[];
    relationships: EntityRelationship[];
};
/**
 * Find related entities by name similarity
 */
export declare function findRelatedEntities(entity: Entity, allEntities: Entity[], threshold?: number): Entity[];
//# sourceMappingURL=entity-extractor.d.ts.map