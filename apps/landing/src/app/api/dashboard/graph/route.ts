import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/api-guard';
import { supaQuery, resolveSupabaseUser } from '@/lib/supabase-read';
import { cachedQuery, checkRateLimit, type CacheConfig } from '@/lib/api-cache';

const GRAPH_CACHE_PROFILE: CacheConfig = { ttl: 15_000, swr: 30_000, rateLimit: 30, rateWindow: 60_000 };

export async function GET(request: NextRequest) {
  try {
    const authUser = await auth(request);
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const rl = checkRateLimit(authUser.uid, 'graph', GRAPH_CACHE_PROFILE);
    if (!rl.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    const orgId = request.nextUrl.searchParams.get('orgId') || null;
    const cacheKey = `graph:${authUser.uid}:${orgId || 'default'}`;
    const data = await cachedQuery(cacheKey, () => fetchGraphData(authUser.uid, orgId), GRAPH_CACHE_PROFILE);
    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error('[Dashboard Graph] Fatal:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function fetchGraphData(firebaseUid: string, targetOrgId: string | null = null) {
  const supaUser = await resolveSupabaseUser(firebaseUid, targetOrgId);
  if (!supaUser) return emptyGraph();
  const { id: uid } = supaUser;
  let nodes: any[] = [];
  let edges: any[] = [];
  const entityAliases = new Map<string, string>();

  try {
    const result = await supaQuery(
      'SELECT entity_id, name, canonical_name, entity_type, description, first_seen_in, mention_count, created_at, updated_at FROM entities WHERE user_id = $1 ORDER BY mention_count DESC LIMIT 150',
      [uid],
    );
    const canonicalNodes = new Map<string, any>();
    for (const r of result.rows || []) {
      const key = String(r.canonical_name || r.name || r.entity_id).trim().toLowerCase();
      const existing = canonicalNodes.get(key);
      if (existing) {
        entityAliases.set(r.entity_id, existing.id);
        existing.mentionCount += Number(r.mention_count || 1);
        existing.importanceScore = Math.min(1, 0.4 + existing.mentionCount * 0.08);
        if (!existing.description && r.description) existing.description = r.description;
      } else {
        const node = {
          id: r.entity_id || r.canonical_name,
          label: r.name || r.canonical_name,
          type: r.entity_type || 'concept',
          description: r.description || '',
          summary: r.description || '',
          mentionCount: Number(r.mention_count || 1),
          importanceScore: Math.min(1, 0.4 + Number(r.mention_count || 1) * 0.08),
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          firstSeenIn: r.first_seen_in || undefined,
        };
        canonicalNodes.set(key, node);
        entityAliases.set(r.entity_id, node.id);
      }
    }
    nodes = Array.from(canonicalNodes.values());
  } catch (error) {
    console.warn('[Dashboard Graph] Entity query warning:', error);
  }

  if (nodes.length === 0) {
    try {
      const result = await supaQuery(
        'SELECT node_id, blind_name_hash, entity_type, mention_count, importance_score, created_at, updated_at FROM graph_nodes WHERE user_id = $1 LIMIT 150',
        [uid],
      );
      nodes = (result.rows || []).map((r: any) => ({
        id: r.node_id,
        label: String(r.blind_name_hash || r.node_id).slice(0, 14),
        type: r.entity_type || 'concept',
        description: '',
        summary: '',
        mentionCount: Number(r.mention_count || 1),
        importanceScore: Number(r.importance_score || 0.5),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        firstSeenIn: r.first_seen_in || undefined,
      }));
    } catch (error) {
      console.warn('[Dashboard Graph] Sovereign node query warning:', error);
    }
  }

  try {
    let result;
    try {
      result = await supaQuery(
        'SELECT relationship_id, source_entity_id, target_entity_id, relationship_type, strength, evidence_count, edge_source, confidence, reinforcement_count, last_reinforced_at, source_memories, created_at FROM entity_relationships WHERE user_id = $1 ORDER BY strength DESC LIMIT 500',
        [uid],
      );
    } catch {
      result = await supaQuery(
        'SELECT relationship_id, source_entity_id, target_entity_id, relationship_type, strength, evidence_count, created_at FROM entity_relationships WHERE user_id = $1 ORDER BY strength DESC LIMIT 500',
        [uid],
      );
    }
    const normalizedEdges = new Map<string, any>();
    for (const r of result.rows || []) {
      const source = entityAliases.get(r.source_entity_id) || r.source_entity_id;
      const target = entityAliases.get(r.target_entity_id) || r.target_entity_id;
      if (!source || !target || source === target) continue;
      const pair = [source, target].sort().join('|');
      const key = `${pair}|${r.relationship_type || 'related_to'}`;
      if (normalizedEdges.has(key)) continue;
      normalizedEdges.set(key, {
      id: r.relationship_id,
      source,
      target,
      relationshipType: r.relationship_type || 'related_to',
      strength: Number(r.strength || 1),
      edgeSource: r.edge_source || 'explicit',
      confidence: Number(r.confidence ?? r.strength ?? 0.5),
      evidenceCount: Number(r.evidence_count || 1),
      reinforcementCount: Number(r.reinforcement_count || r.evidence_count || 1),
      lastReinforcedAt: r.last_reinforced_at || r.created_at,
      sourceMemories: r.source_memories || [],
      isValid: true,
      validFrom: r.created_at,
      validTo: null,
      });
    }
    edges = Array.from(normalizedEdges.values());
  } catch (error) {
    console.warn('[Dashboard Graph] Semantic edge query warning:', error);
  }

  if (edges.length === 0) {
    try {
      const result = await supaQuery(
        'SELECT edge_id, source_node_id, target_node_id, relationship_type, strength, valid_from, valid_to, created_at FROM graph_edges WHERE user_id = $1 LIMIT 500',
        [uid],
      );
      edges = (result.rows || []).map((r: any) => ({
        id: r.edge_id,
        source: r.source_node_id,
        target: r.target_node_id,
        relationshipType: r.relationship_type || 'related_to',
        strength: Number(r.strength || 1),
        edgeSource: 'explicit',
        confidence: Number(r.strength || 0.5),
        evidenceCount: 1,
        reinforcementCount: 1,
        lastReinforcedAt: r.created_at,
        sourceMemories: [],
        isValid: !r.valid_to,
        validFrom: r.valid_from || r.created_at,
        validTo: r.valid_to || null,
      }));
    } catch (error) {
      console.warn('[Dashboard Graph] Sovereign edge query warning:', error);
    }
  }

  // Resolve the real memory records behind entities and relationships. The
  // graph itself stores encrypted memory content, so the dashboard exposes
  // safe metadata (title, bucket, and extracted summary) as node evidence.
  const evidencePointers = Array.from(new Set([
    ...nodes.map(node => node.firstSeenIn).filter(Boolean),
    ...edges.flatMap(edge => Array.isArray(edge.sourceMemories) ? edge.sourceMemories : []),
  ]));
  if (evidencePointers.length > 0) {
    try {
      const evidenceResult = await supaQuery(
        `SELECT pointer_id, title, bucket, metadata, created_at
         FROM memories
         WHERE user_id = $1 AND pointer_id = ANY($2::varchar[])
         ORDER BY created_at DESC`,
        [uid, evidencePointers],
      );
      const evidenceByPointer = new Map<string, any>();
      for (const row of evidenceResult.rows || []) {
        const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
        evidenceByPointer.set(row.pointer_id, {
          pointerId: row.pointer_id,
          title: row.title || 'Untitled memory',
          bucket: row.bucket || 'conversation',
          summary: metadata.summary || metadata.description || metadata.context || '',
          createdAt: row.created_at,
        });
      }
      nodes = nodes.map(node => {
        const pointers = new Set<string>();
        if (node.firstSeenIn) pointers.add(node.firstSeenIn);
        for (const edge of edges) {
          if (edge.source === node.id || edge.target === node.id) {
            for (const pointer of edge.sourceMemories || []) pointers.add(pointer);
          }
        }
        const evidence = Array.from(pointers)
          .map(pointer => evidenceByPointer.get(pointer))
          .filter(Boolean)
          .slice(0, 6);
        const firstEvidence = evidence[0];
        return {
          ...node,
          evidence,
          description: node.type === 'memory' && firstEvidence
            ? `Stored in ${firstEvidence.bucket}`
            : node.description,
          summary: firstEvidence?.summary || (node.type === 'memory' ? firstEvidence?.title : node.summary) || '',
        };
      });
    } catch (error) {
      console.warn('[Dashboard Graph] Memory evidence query warning:', error);
    }
  }

  const activeEdges = edges.filter(edge => edge.isValid).length;
  const density = nodes.length > 1 ? edges.length / (nodes.length * (nodes.length - 1)) : 0;
  return {
    nodes,
    edges,
    stats: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      activeEdges,
      isolatedNodes: nodes.filter(node => !edges.some(edge => edge.source === node.id || edge.target === node.id)).length,
      density: Number(density.toFixed(3)),
    },
  };
}

function emptyGraph() {
  return { nodes: [], edges: [], stats: { totalNodes: 0, totalEdges: 0, activeEdges: 0, isolatedNodes: 0, density: 0 } };
}
