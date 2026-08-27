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
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    activeEdges: number;
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
  const [layoutMode, setLayoutMode] = useState<'orbital' | 'force'>('orbital');
  
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const draggedNodeRef = useRef<GraphNode | null>(null);
  const hoveredNodeRef = useRef<GraphNode | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  const simNodesRef = useRef<GraphNode[]>([]);
  const animFrameRef = useRef<number>(0);

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

      const initializedNodes: GraphNode[] = (json.nodes || []).map((node, idx) => {
        if (node.isRoot || node.id === 'root') {
          return {
            ...node,
            x: cx,
            y: cy,
            vx: 0,
            vy: 0,
            radius: 28,
          };
        }

        const totalNonRoot = (json.nodes || []).filter(n => !n.isRoot && n.id !== 'root').length || 1;
        const nonRootIdx = (json.nodes || []).filter(n => !n.isRoot && n.id !== 'root').indexOf(node);
        const angle = (nonRootIdx / totalNonRoot) * Math.PI * 2 + (idx * 0.2);
        
        const dist = 140 + (node.importanceScore * 120) + ((idx % 3) * 45);
        const nodeRadius = 14 + Math.round(node.importanceScore * 18);

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
          const matchesType = selectedType === 'all' || n.type.toLowerCase() === selectedType.toLowerCase() || n.isRoot;
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

      ctx.fillStyle = isLight ? '#f8f8fa' : '#000000';
      ctx.fillRect(0, 0, width, height);

      ctx.translate(width / 2 + transform.x, height / 2 + transform.y);
      ctx.scale(transform.scale, transform.scale);
      ctx.translate(-width / 2, -height / 2);

      const nodes = simNodesRef.current;
      const rootNode = nodes.find(n => n.isRoot || n.id === 'root');
      const cx = rootNode ? rootNode.x! : width / 2;
      const cy = rootNode ? rootNode.y! : height / 2;

      ctx.save();
      [140, 240, 330].forEach((r, idx) => {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = isLight
          ? `rgba(0, 0, 0, ${0.05 - idx * 0.01})`
          : `rgba(255, 255, 255, ${0.04 - idx * 0.01})`;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 8]);
        ctx.stroke();
      });
      ctx.restore();

      if (layoutMode === 'orbital') {
        nodes.forEach(n => {
          if (n.isRoot || n === draggedNodeRef.current) return;
          n.x! += Math.sin(elapsed + n.radius!) * 0.12;
          n.y! += Math.cos(elapsed + n.radius!) * 0.12;
        });
      }

      if (data?.edges) {
        data.edges.forEach(edge => {
          const s = nodes.find(n => n.id === edge.source);
          const t = nodes.find(n => n.id === edge.target);
          if (!s || !t) return;

          const isHovered = hoveredNodeId === s.id || hoveredNodeId === t.id;
          const isDimmed = hoveredNodeId && !isHovered;

          ctx.save();
          ctx.beginPath();
          ctx.moveTo(s.x!, s.y!);
          ctx.lineTo(t.x!, t.y!);

          if (isHovered) {
            ctx.strokeStyle = '#7c3aed';
            ctx.lineWidth = 2;
            ctx.shadowColor = '#7c3aed';
            ctx.shadowBlur = 8;
          } else if (isDimmed) {
            ctx.strokeStyle = isLight ? 'rgba(0, 0, 0, 0.03)' : 'rgba(255, 255, 255, 0.03)';
            ctx.lineWidth = 0.8;
          } else {
            ctx.strokeStyle = isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.12)';
            ctx.lineWidth = 1;
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
            ctx.fillStyle = isHovered ? '#8b5cf6' : (isLight ? '#7c3aed' : '#c4b5fd');
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

        if (node.isRoot || node.id === 'root') {
          const pulseR = r + (Math.sin(elapsed * 2) + 1) * 8;
          ctx.beginPath();
          ctx.arc(node.x!, node.y!, pulseR, 0, Math.PI * 2);
          ctx.strokeStyle = isLight ? 'rgba(124, 58, 237, 0.25)' : 'rgba(139, 92, 246, 0.3)';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(node.x!, node.y!, r + 6, 0, Math.PI * 2);
          ctx.strokeStyle = isLight ? 'rgba(0, 0, 0, 0.25)' : 'rgba(255, 255, 255, 0.4)';
          ctx.setLineDash([3, 3]);
          ctx.lineWidth = 2;
          ctx.stroke();

          const rootGrad = ctx.createRadialGradient(
            node.x! - r * 0.35, node.y! - r * 0.35, r * 0.1,
            node.x!, node.y!, r
          );
          if (isLight) {
            rootGrad.addColorStop(0, '#7c3aed');
            rootGrad.addColorStop(0.6, '#5b21b6');
            rootGrad.addColorStop(1, '#2e1065');
          } else {
            rootGrad.addColorStop(0, '#ffffff');
            rootGrad.addColorStop(0.6, '#e2e8f0');
            rootGrad.addColorStop(1, '#94a3b8');
          }

          ctx.beginPath();
          ctx.arc(node.x!, node.y!, r, 0, Math.PI * 2);
          ctx.fillStyle = rootGrad;
          ctx.shadowColor = isLight ? 'rgba(124, 58, 237, 0.4)' : 'rgba(255, 255, 255, 0.6)';
          ctx.shadowBlur = 18;
          ctx.fill();
        } else {
          const orbGrad = ctx.createRadialGradient(
            node.x! - r * 0.38, node.y! - r * 0.38, r * 0.08,
            node.x!, node.y!, r
          );
          
          orbGrad.addColorStop(0, '#ddd6fe');
          orbGrad.addColorStop(0.25, '#8b5cf6');
          orbGrad.addColorStop(0.7, '#6d28d9');
          orbGrad.addColorStop(1, '#3b0764');

          ctx.beginPath();
          ctx.arc(node.x!, node.y!, r, 0, Math.PI * 2);
          ctx.fillStyle = orbGrad;

          if (isHovered || isSelected) {
            ctx.shadowColor = '#7c3aed';
            ctx.shadowBlur = 24;
          } else {
            ctx.shadowColor = 'rgba(124, 58, 237, 0.35)';
            ctx.shadowBlur = 12;
          }
          ctx.fill();
        }

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
          ? '#7c3aed'
          : (isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.14)');
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = isLight
          ? (isHovered || isSelected ? '#7c3aed' : '#111113')
          : (isHovered || isSelected ? '#ffffff' : '#ededef');
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
  }, [data, transform, hoveredNodeId, selectedNode, filteredNodeIds, layoutMode]);

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
            {['all', 'tool', 'concept', 'system', 'framework'].map(type => (
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
            onClick={() => setLayoutMode(l => (l === 'orbital' ? 'force' : 'orbital'))}
            className="mm-graph-btn"
          >
            <Layers size={13} />
            <span>{layoutMode === 'orbital' ? 'Orbital Radial' : 'Force Physics'}</span>
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
              <span className="mm-graph-legend-dot-root" />
              <span>Central Anchor Hub (root)</span>
            </div>
            <div className="mm-graph-legend-row">
              <span className="mm-graph-legend-dot-entity" />
              <span>Entity Nodes (size = importance)</span>
            </div>
            <div className="mm-graph-legend-row">
              <span className="mm-graph-legend-line" />
              <span>Active Bi-Temporal Edges</span>
            </div>
          </div>
        )}

        <div className="mm-graph-watermark">
          <Shield size={12} />
          <span>Click on any entity sphere to inspect bi-temporal relationships • Drag to pan • Scroll to zoom</span>
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
                          <span className="mm-graph-edge-type">{edge.relationshipType}</span>
                          <span className="mm-graph-edge-target">{otherNode?.label || otherId}</span>
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
