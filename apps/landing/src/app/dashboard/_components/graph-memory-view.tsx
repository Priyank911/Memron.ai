'use client';

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  GitBranch, Search, RefreshCw, ZoomIn, ZoomOut, Maximize2,
  Layers, Shield, X, Database
} from 'lucide-react';
import type { OrgInfo } from './types';

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  description?: string;
  mentionCount: number;
  importanceScore: number;
  isRoot?: boolean;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  radius?: number;
  summary?: string;
  firstSeenIn?: string;
  evidence?: Array<{
    pointerId: string;
    title: string;
    bucket: string;
    summary?: string;
    createdAt?: string;
  }>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  relationshipType: string;
  strength: number;
  isValid: boolean;
  validFrom?: string;
  validTo?: string | null;
  edgeSource?: 'explicit' | 'co_occurrence' | 'semantic_similarity' | 'legacy_anchor' | string;
  confidence?: number;
  evidenceCount?: number;
  reinforcementCount?: number;
  lastReinforcedAt?: string;
  sourceMemories?: string[];
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    activeEdges: number;
    isolatedNodes?: number;
    density: number;
  };
}

interface GraphMemoryViewProps {
  org: OrgInfo | null;
}

export function GraphMemoryView({ org }: GraphMemoryViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<GraphData | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [gravityOn, setGravityOn] = useState(true);
  
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const draggedNodeRef = useRef<GraphNode | null>(null);
  const hoveredNodeRef = useRef<GraphNode | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const simNodesRef = useRef<GraphNode[]>([]);
  const animFrameRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);

  const fetchGraph = useCallback(async () => {
    try {
      setRefreshing(true);
      const orgId = org?.id;
      const url = orgId ? `/api/dashboard/graph?orgId=${orgId}` : '/api/dashboard/graph';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch graph data: ${res.statusText}`);
      const json: GraphData = await res.json();
      setData(json);

      const width = containerRef.current?.clientWidth || 900;
      const height = containerRef.current?.clientHeight || 600;
      const cx = width / 2;
      const cy = height / 2;
      const degree = new Map<string, number>();
      (json.edges || []).forEach(edge => {
        degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
        degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
      });

      const initializedNodes: GraphNode[] = (json.nodes || []).map((node, idx) => {
        const angle = idx * 2.39996;
        const dist = 92 + Math.sqrt(idx + 1) * 66;
        const nodeRadius = 10 + Math.min(15, (degree.get(node.id) || 0) * 1.9) + Math.round(node.importanceScore * 4);

        return {
          ...node,
          x: cx + Math.cos(angle) * dist,
          y: cy + Math.sin(angle) * dist,
          vx: (Math.random() - 0.5) * 0.2,
          vy: (Math.random() - 0.5) * 0.2,
          radius: nodeRadius,
        };
      });

      simNodesRef.current = initializedNodes;
      lastFrameRef.current = 0;
    } catch (err) {
      console.warn('[GraphMemoryView] Error loading graph:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [org]);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  const filteredNodeIds = useMemo(() => {
    if (!data?.nodes) return new Set<string>();
    return new Set(
      data.nodes
        .filter(n => {
          const matchesSearch = !searchQuery || n.label.toLowerCase().includes(searchQuery.toLowerCase());
          const normalizedType = n.type.toLowerCase();
          const matchesType = selectedType === 'all'
            || normalizedType === selectedType.toLowerCase()
            || (selectedType === 'knowledge' && (normalizedType === 'memory' || normalizedType === 'knowledge'))
            || n.isRoot;
          return matchesSearch && matchesType;
        })
        .map(n => n.id)
    );
  }, [data, searchQuery, selectedType]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let startTime = performance.now();

    const render = (time: number) => {
      const elapsed = (time - startTime) / 1000;
      const frameDelta = lastFrameRef.current ? Math.min(2, (time - lastFrameRef.current) / 16.67) : 1;
      lastFrameRef.current = time;
      const simStep = Math.min(0.12, 0.075 * frameDelta);
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      const isLight = document.documentElement.getAttribute('data-mm-theme') === 'light';

      // The graph deliberately uses a neutral monochrome palette. Semantic
      // meaning comes from line style and node geometry, not accent colors.
      ctx.fillStyle = isLight ? '#f7f7f7' : '#050505';
      ctx.fillRect(0, 0, width, height);

      ctx.translate(width / 2 + transform.x, height / 2 + transform.y);
      ctx.scale(transform.scale, transform.scale);
      ctx.translate(-width / 2, -height / 2);

      const nodes = simNodesRef.current;
      {
        const iterations = gravityOn ? 0.34 : 0.18;
        const repulsion = gravityOn ? 6200 : 12500;
        const collisionPadding = gravityOn ? 34 : 58;
        for (let i = 0; i < nodes.length; i++) {
          const a = nodes[i];
          if (a === draggedNodeRef.current) continue;
          let fx = (width / 2 - a.x!) * 0.0008;
          let fy = (height / 2 - a.y!) * 0.0008;
          for (let j = i + 1; j < nodes.length; j++) {
            const b = nodes[j];
            const dx = a.x! - b.x!;
            const dy = a.y! - b.y!;
            const distSq = Math.max(dx * dx + dy * dy, 1600);
            const force = repulsion / distSq;
            fx += (dx / Math.sqrt(distSq)) * force;
            fy += (dy / Math.sqrt(distSq)) * force;
            if (b !== draggedNodeRef.current) {
              b.vx = (b.vx || 0) - (dx / Math.sqrt(distSq)) * force * 0.02 * iterations * simStep;
              b.vy = (b.vy || 0) - (dy / Math.sqrt(distSq)) * force * 0.02 * iterations * simStep;
            }
            const minDistance = (a.radius || 18) + (b.radius || 18) + collisionPadding;
            const actualDistance = Math.sqrt(dx * dx + dy * dy) || 1;
            if (actualDistance < minDistance) {
              const push = (minDistance - actualDistance) / minDistance;
              const nx = dx / actualDistance;
              const ny = dy / actualDistance;
              fx += nx * push * 2.4;
              fy += ny * push * 2.4;
              if (b !== draggedNodeRef.current) {
                b.x! -= nx * push * 0.8;
                b.y! -= ny * push * 0.8;
              }
            }
          }
          a.vx = ((a.vx || 0) + fx * simStep) * 0.87;
          a.vy = ((a.vy || 0) + fy * simStep) * 0.87;
          a.x! += (a.vx || 0) * simStep * iterations;
          a.y! += (a.vy || 0) * simStep * iterations;
        }
        (data?.edges || []).forEach(edge => {
          const s = nodes.find(n => n.id === edge.source);
          const t = nodes.find(n => n.id === edge.target);
          if (!s || !t) return;
          const dx = t.x! - s.x!;
          const dy = t.y! - s.y!;
          const distance = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const targetDistance = gravityOn ? 142 : 238;
          const force = (distance - targetDistance) * 0.0008;
          if (s !== draggedNodeRef.current) { s.x! += dx * force * simStep; s.y! += dy * force * simStep; }
          if (t !== draggedNodeRef.current) { t.x! -= dx * force * simStep; t.y! -= dy * force * simStep; }
        });
      }

      if (data?.edges) {
        data.edges.forEach(edge => {
          const s = nodes.find(n => n.id === edge.source);
          const t = nodes.find(n => n.id === edge.target);
          if (!s || !t) return;

          const isHovered = hoveredNodeId === s.id || hoveredNodeId === t.id || selectedNode?.id === s.id || selectedNode?.id === t.id;
          const isDimmed = hoveredNodeId && !isHovered;

          ctx.save();
          ctx.beginPath();
          ctx.moveTo(s.x!, s.y!);
          ctx.lineTo(t.x!, t.y!);

          if (isHovered) {
            ctx.strokeStyle = isLight ? '#111111' : '#ffffff';
            ctx.lineWidth = 2.2;
            ctx.shadowColor = isLight ? 'rgba(0,0,0,0.24)' : 'rgba(255,255,255,0.4)';
            ctx.shadowBlur = 7;
          } else if (isDimmed) {
            ctx.strokeStyle = isLight ? 'rgba(0, 0, 0, 0.03)' : 'rgba(255, 255, 255, 0.03)';
            ctx.lineWidth = 0.8;
          } else {
            const weak = edge.edgeSource === 'co_occurrence';
            ctx.strokeStyle = isLight ? (weak ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.68)') : (weak ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.68)');
            ctx.lineWidth = weak ? 1.15 : Math.max(1.5, Math.min(2.8, 1.3 + (edge.confidence || edge.strength) * 1.5));
            if (weak) ctx.setLineDash([5, 6]);
            if (!isDimmed) { ctx.shadowColor = weak ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.16)'; ctx.shadowBlur = 4; }
          }

          if (!edge.isValid) {
            ctx.setLineDash([3, 5]);
          }

          ctx.stroke();
          ctx.restore();

          if (edge.isValid && !isDimmed) {
            const progress = (elapsed * 0.35 + (s.radius! * 0.1)) % 1;
            const px = s.x! + (t.x! - s.x!) * progress;
            const py = s.y! + (t.y! - s.y!) * progress;

            ctx.beginPath();
            ctx.arc(px, py, 1.8, 0, Math.PI * 2);
            ctx.fillStyle = isHovered ? '#ffffff' : (isLight ? '#222222' : '#d4d4d4');
            ctx.fill();
          }
        });
      }

      nodes.forEach(node => {
        const isMatched = filteredNodeIds.has(node.id);
        const isHovered = hoveredNodeId === node.id;
        const isSelected = selectedNode?.id === node.id;
        const r = node.radius || 18;

        ctx.save();
        ctx.globalAlpha = isMatched ? 1.0 : 0.18;

        ctx.beginPath();
        ctx.arc(node.x!, node.y!, r, 0, Math.PI * 2);
        ctx.fillStyle = isLight ? (isSelected ? '#111111' : '#d5d5d5') : (isSelected ? '#f5f5f5' : '#242424');
        ctx.strokeStyle = isHovered || isSelected ? (isLight ? '#000000' : '#ffffff') : (isLight ? '#555555' : '#9a9a9a');
        ctx.lineWidth = isHovered || isSelected ? 2 : 1;
        ctx.shadowColor = isHovered || isSelected ? (isLight ? 'rgba(0,0,0,0.28)' : 'rgba(255,255,255,0.38)') : 'transparent';
        ctx.shadowBlur = isHovered || isSelected ? 12 : 0;
        ctx.fill();
        ctx.stroke();

        const labelText = node.label;
        ctx.font = '500 10.5px "Inter", sans-serif';
        const textMetrics = ctx.measureText(labelText);
        const pillWidth = textMetrics.width + 16;
        const pillHeight = 22;
        const pillX = node.x! - pillWidth / 2;
        const pillY = node.y! - r - 22;

        ctx.save();
        ctx.shadowColor = isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(0, 0, 0, 0.6)';
        ctx.shadowBlur = 10;
        ctx.fillStyle = isLight
          ? (isHovered || isSelected ? 'rgba(255, 255, 255, 1)' : 'rgba(245, 245, 248, 0.95)')
          : (isHovered || isSelected ? 'rgba(24, 24, 32, 0.96)' : 'rgba(12, 12, 16, 0.9)');
        
        ctx.beginPath();
        roundRect(ctx, pillX, pillY, pillWidth, pillHeight, 5);
        ctx.fill();

        ctx.strokeStyle = (isHovered || isSelected)
          ? (isLight ? '#111111' : '#ffffff')
          : (isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.14)');
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = isLight
          ? (isHovered || isSelected ? '#ffffff' : '#111111')
          : (isHovered || isSelected ? '#ffffff' : '#e5e5e5');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, node.x!, pillY + pillHeight / 2);
        ctx.restore();

        ctx.restore();
      });

      ctx.restore();
      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [data, transform, hoveredNodeId, selectedNode, filteredNodeIds, gravityOn]);

  function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    const worldX = (mouseX - (width / 2 + transform.x)) / transform.scale + width / 2;
    const worldY = (mouseY - (height / 2 + transform.y)) / transform.scale + height / 2;

    const clickedNode = simNodesRef.current.find(n => {
      const dx = worldX - n.x!;
      const dy = worldY - n.y!;
      return Math.sqrt(dx * dx + dy * dy) <= (n.radius || 18) + 8;
    });

    if (clickedNode) {
      draggedNodeRef.current = clickedNode;
      setSelectedNode(clickedNode);
    } else {
      isDraggingRef.current = true;
      dragStartRef.current = { x: e.clientX - transform.x, y: e.clientY - transform.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;

    const worldX = (mouseX - (width / 2 + transform.x)) / transform.scale + width / 2;
    const worldY = (mouseY - (height / 2 + transform.y)) / transform.scale + height / 2;

    if (draggedNodeRef.current) {
      draggedNodeRef.current.x = worldX;
      draggedNodeRef.current.y = worldY;
      return;
    }

    if (isDraggingRef.current) {
      setTransform(prev => ({
        ...prev,
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      }));
      return;
    }

    const hovered = simNodesRef.current.find(n => {
      const dx = worldX - n.x!;
      const dy = worldY - n.y!;
      return Math.sqrt(dx * dx + dy * dy) <= (n.radius || 18) + 6;
    });

    if (hovered) {
      hoveredNodeRef.current = hovered;
      setHoveredNodeId(hovered.id);
      canvas.style.cursor = 'pointer';
    } else {
      hoveredNodeRef.current = null;
      setHoveredNodeId(null);
      canvas.style.cursor = 'grab';
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    draggedNodeRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    setTransform(prev => ({
      ...prev,
      scale: Math.min(Math.max(prev.scale * zoomFactor, 0.4), 3.0),
    }));
  };

  const resetZoom = () => {
    setTransform({ x: 0, y: 0, scale: 1 });
  };

  const selectedNodeEdges = useMemo(() => {
    if (!selectedNode || !data?.edges) return [];
    return data.edges.filter(e => e.source === selectedNode.id || e.target === selectedNode.id);
  }, [selectedNode, data]);

  return (
    <div className="mm-graph-view">
      <div className="mm-graph-bar">
        <div className="mm-graph-title-group">
          <div className="mm-graph-icon-badge">
            <GitBranch size={18} strokeWidth={2} />
          </div>
          <div className="mm-graph-headings">
            <div className="mm-graph-h1">
              <span>Knowledge Graph Engine</span>
              <span className="mm-graph-live-tag">
                <span className="mm-graph-live-dot" />
                Live Sync
              </span>
            </div>
            <span className="mm-graph-subtitle">
              {data?.stats.totalNodes || 0} Entities • {data?.stats.activeEdges || 0} Active Edges • Zero-Knowledge Encrypted
            </span>
          </div>
        </div>

        <div className="mm-graph-center">
          <div className="mm-graph-search-wrap">
            <Search size={14} className="mm-graph-search-icon" />
            <input
              type="text"
              placeholder="Search graph entities..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="mm-graph-search-input"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="mm-graph-search-clear">
                <X size={12} />
              </button>
            )}
          </div>

          <div className="mm-graph-filter-seg">
            {['all', 'knowledge', 'tool', 'concept', 'system', 'framework'].map(type => (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className={`mm-graph-filter-tab${selectedType === type ? ' active' : ''}`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <div className="mm-graph-actions">
          <button
            onClick={() => setGravityOn(value => !value)}
            aria-pressed={gravityOn}
            className="mm-graph-btn"
            title={gravityOn ? 'Gravity on: bring connected nodes closer' : 'Gravity off: give nodes more breathing room'}
          >
            <Layers size={13} />
            <span>Gravity</span>
            <span className="mm-graph-toggle-state">{gravityOn ? 'On' : 'Off'}</span>
          </button>

          <button
            onClick={fetchGraph}
            disabled={refreshing}
            className="mm-graph-btn"
          >
            <RefreshCw size={13} className={refreshing ? 'mm-spin' : ''} />
            <span>Refresh</span>
          </button>

          <div className="mm-graph-zoom-box">
            <button
              onClick={() => setTransform(p => ({ ...p, scale: Math.min(p.scale * 1.2, 3.0) }))}
              className="mm-graph-zoom-btn"
              title="Zoom In"
            >
              <ZoomIn size={14} />
            </button>
            <button
              onClick={() => setTransform(p => ({ ...p, scale: Math.max(p.scale * 0.8, 0.4) }))}
              className="mm-graph-zoom-btn"
              title="Zoom Out"
            >
              <ZoomOut size={14} />
            </button>
            <button
              onClick={resetZoom}
              className="mm-graph-zoom-btn"
              title="Reset View"
            >
              <Maximize2 size={13} />
            </button>
          </div>
        </div>
      </div>

      <div ref={containerRef} className="mm-graph-canvas-area">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          className="mm-graph-canvas"
        />

        {!loading && (!data?.nodes || data.nodes.length === 0) && (
          <div className="mm-graph-empty-overlay">
            <div className="mm-graph-empty-icon">
              <GitBranch size={26} strokeWidth={2} />
            </div>
            <h3 className="mm-graph-empty-title">No Graph Entities Ingested Yet</h3>
            <p className="mm-graph-empty-desc">
              When your connected AI agents (Cursor, Claude Desktop, or SDK) store memories via MCP, entities and bi-temporal knowledge graph relationships will automatically appear here in real-time.
            </p>
            <div className="mm-graph-empty-badge">
              <span className="mm-graph-live-dot" />
              <span>PostgreSQL Engine Active • Zero-Knowledge Encrypted</span>
            </div>
          </div>
        )}

        {data?.nodes && data.nodes.length > 0 && (
          <div className="mm-graph-legend-card">
            <div className="mm-graph-legend-title">Topology Legend</div>
            <div className="mm-graph-legend-row">
              <span className="mm-graph-legend-line mm-graph-legend-line-explicit" />
              <span>Explicit relationship</span>
            </div>
            <div className="mm-graph-legend-row">
              <span className="mm-graph-legend-dot-entity" />
              <span>Entity nodes (size = connectivity)</span>
            </div>
            <div className="mm-graph-legend-row">
              <span className="mm-graph-legend-line mm-graph-legend-line-weak" />
              <span>Co-occurrence relationship</span>
            </div>
          </div>
        )}

        <div className="mm-graph-watermark">
          <Shield size={12} />
          <span>Click an entity to inspect evidence • Drag to pan • Scroll to zoom</span>
        </div>

        {selectedNode && (
          <div className="mm-graph-drawer">
            <div className="mm-graph-drawer-head">
              <div className="mm-graph-drawer-title-row">
                <div className="mm-graph-drawer-icon">
                  <Database size={18} />
                </div>
                <div>
                  <h3 className="mm-graph-drawer-name">{selectedNode.label}</h3>
                  <span className="mm-graph-drawer-type">{selectedNode.type}</span>
                </div>
              </div>
              <button onClick={() => setSelectedNode(null)} className="mm-graph-drawer-close">
                <X size={16} />
              </button>
            </div>

            <div className="mm-graph-drawer-body">
              <div className="mm-graph-stat-grid">
                <div className="mm-graph-stat-card">
                  <span className="mm-graph-stat-label">Importance</span>
                  <span className="mm-graph-stat-val">{(selectedNode.importanceScore * 100).toFixed(0)}%</span>
                </div>
                <div className="mm-graph-stat-card">
                  <span className="mm-graph-stat-label">Mentions</span>
                  <span className="mm-graph-stat-val">{selectedNode.mentionCount}</span>
                </div>
              </div>

              {selectedNode.description && (
                <div>
                  <div className="mm-graph-section-title">Description</div>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--mm-text-2)', marginTop: '4px', lineHeight: '1.5' }}>
                    {selectedNode.description}
                  </p>
                </div>
              )}

              <div>
                <div className="mm-graph-section-title">Node summary</div>
                <p className="mm-graph-node-summary">
                  {selectedNode.summary || selectedNode.description || 'No extracted summary is available for this node yet.'}
                </p>
              </div>

              {selectedNode.evidence && selectedNode.evidence.length > 0 && (
                <div>
                  <div className="mm-graph-section-title">Relevant memories ({selectedNode.evidence.length})</div>
                  <div className="mm-graph-evidence-list">
                    {selectedNode.evidence.map(memory => (
                      <div key={memory.pointerId} className="mm-graph-evidence-item">
                        <div className="mm-graph-evidence-title">{memory.title}</div>
                        <div className="mm-graph-evidence-meta">{memory.bucket}</div>
                        {memory.summary && <p>{memory.summary}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="mm-graph-section-title">
                  Connected Relationships ({selectedNodeEdges.length})
                </div>
                <div className="mm-graph-edge-list" style={{ marginTop: '8px' }}>
                  {selectedNodeEdges.length === 0 ? (
                    <p style={{ fontSize: '0.75rem', color: 'var(--mm-text-3)' }}>No direct relationships recorded yet</p>
                  ) : (
                    selectedNodeEdges.map(edge => {
                      const isSource = edge.source === selectedNode.id;
                      const otherId = isSource ? edge.target : edge.source;
                      const otherNode = data?.nodes.find(n => n.id === otherId);
                      return (
                        <div key={edge.id} className="mm-graph-edge-item">
                          <div className="mm-graph-edge-main">
                            <span className="mm-graph-edge-type">{edge.relationshipType}</span>
                            <span className="mm-graph-edge-target" title={otherNode?.label || otherId}>{otherNode?.label || otherId}</span>
                          </div>
                          <span className="mm-graph-edge-meta">{edge.edgeSource === 'co_occurrence' ? 'co-occurrence' : 'explicit'} · {edge.reinforcementCount || 1}×</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
