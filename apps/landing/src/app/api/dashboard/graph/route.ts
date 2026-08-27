import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/api-guard';
import { supaQuery, resolveSupabaseUser, buildUserWhereClause } from '@/lib/supabase-read';
import { cachedQuery, checkRateLimit, type CacheConfig } from '@/lib/api-cache';

const GRAPH_CACHE_PROFILE: CacheConfig = { ttl: 15_000, swr: 30_000, rateLimit: 30, rateWindow: 60_000 };

export async function GET(request: NextRequest) {
  try {
    const authUser = await auth(request);
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rl = checkRateLimit(authUser.uid, 'graph', GRAPH_CACHE_PROFILE);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.retryAfter || 60_000) / 1000)) } },
      );
    }

    const orgId = request.nextUrl.searchParams.get('orgId') || null;
    const cacheKey = `graph:${authUser.uid}:${orgId || 'default'}`;
    const data = await cachedQuery(cacheKey, () => fetchGraphData(authUser.uid, orgId), GRAPH_CACHE_PROFILE);
    return NextResponse.json(data);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown';
    console.error('[Dashboard Graph] Fatal:', msg);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function fetchGraphData(firebaseUid: string, targetOrgId: string | null = null) {
  const supaUser = await resolveSupabaseUser(firebaseUid, targetOrgId);
  if (!supaUser) {
    return { nodes: [], edges: [], stats: { totalNodes: 0, totalEdges: 0, activeEdges: 0, density: 0 } };
  }

  const { id: uid, orgId } = supaUser;
  let nodes: any[] = [];
  let edges: any[] = [];

  // 1. Try fetching from graph_nodes (sovereign engine), fallback to entities
  try {
    const graphNodesRes = await supaQuery(
      'SELECT node_id, blind_name_hash, entity_type, mention_count, importance_score, created_at, updated_at FROM graph_nodes WHERE user_id = $1 LIMIT 100',
      [uid],
    );
    if (graphNodesRes.rows && graphNodesRes.rows.length > 0) {
      nodes = graphNodesRes.rows.map((r: any) => ({
        id: r.node_id,
        label: r.blind_name_hash.slice(0, 14),
        type: r.entity_type || 'concept',
        description: '',
        mentionCount: parseInt(r.mention_count || '1', 10),
        importanceScore: parseFloat(r.importance_score || '0.5'),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    }
  } catch {
    // graph_nodes table not populated yet
  }

  if (nodes.length === 0) {
    try {
      const entitiesRes = await supaQuery(
        'SELECT entity_id, name, canonical_name, entity_type, description, mention_count, created_at, updated_at FROM entities WHERE user_id = $1 ORDER BY mention_count DESC LIMIT 100',
        [uid],
      );
      nodes = (entitiesRes.rows || []).map((r: any) => ({
        id: r.entity_id || r.canonical_name,
        label: r.name || r.canonical_name,
        type: r.entity_type || 'concept',
        description: r.description || '',
        mentionCount: parseInt(r.mention_count || '1', 10),
        importanceScore: Math.min(1.0, 0.4 + (parseInt(r.mention_count || '1', 10) * 0.08)),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    } catch (err) {
      console.warn('[Dashboard Graph] Entity query warning:', err);
    }
  }

  // 2. Try fetching from graph_edges (sovereign bi-temporal engine), fallback to entity_relationships
  try {
    const graphEdgesRes = await supaQuery(
      'SELECT edge_id, source_node_id, target_node_id, relationship_type, strength, valid_from, valid_to, created_at FROM graph_edges WHERE user_id = $1 LIMIT 200',
      [uid],
    );
    if (graphEdgesRes.rows && graphEdgesRes.rows.length > 0) {
      edges = graphEdgesRes.rows.map((r: any) => ({
        id: r.edge_id,
        source: r.source_node_id,
        target: r.target_node_id,
        relationshipType: r.relationship_type || 'related_to',
        strength: parseFloat(r.strength || '1.0'),
        isValid: !r.valid_to,
        validFrom: r.valid_from || r.created_at,
        validTo: r.valid_to || null,
      }));
    }
  } catch {
    // graph_edges table not populated yet
  }

  if (edges.length === 0) {
    try {
      const relsRes = await supaQuery(
        'SELECT relationship_id, source_entity_id, target_entity_id, relationship_type, strength, created_at FROM entity_relationships WHERE user_id = $1 LIMIT 200',
        [uid],
      );
      edges = (relsRes.rows || []).map((r: any) => ({
        id: r.relationship_id,
        source: r.source_entity_id,
        target: r.target_entity_id,
        relationshipType: r.relationship_type || 'related_to',
        strength: parseFloat(r.strength || '1.0'),
        isValid: true,
        validFrom: r.created_at,
        validTo: null,
      }));
    } catch (err) {
      console.warn('[Dashboard Graph] Edge query warning:', err);
    }
  }

  // If user has nodes, ensure anchor root exists for orbital radial layout
  if (nodes.length > 0 && !nodes.some(n => n.id === 'root' || n.isRoot)) {
    nodes.unshift({
      id: 'root',
      label: 'root',
      type: 'system',
      mentionCount: nodes.length * 2,
      importanceScore: 1.0,
      isRoot: true,
    });
    if (edges.length === 0) {
      edges = nodes.filter(n => n.id !== 'root').slice(0, 10).map((n, i) => ({
        id: `e_root_${i}`,
        source: 'root',
        target: n.id,
        relationshipType: 'connects_to',
        strength: 0.85,
        isValid: true,
      }));
    }
  }

  const activeEdges = edges.filter(e => e.isValid).length;
  const density = nodes.length > 1 ? (edges.length / (nodes.length * (nodes.length - 1))).toFixed(3) : 0;

  return {
    nodes,
    edges,
    stats: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      activeEdges,
      density: parseFloat(String(density)),
    },
  };
}
