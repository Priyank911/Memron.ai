'use client';

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import {
  GitBranch, Search, RefreshCw, ZoomIn, ZoomOut, Maximize2,
  Layers, Shield, X, Database, Orbit
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
  /** Depth axis for the orbital projection. Set once at init, never re-randomized. */
  z?: number;
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
  /** Projected screen coords written by the render loop for hit-testing. */
  _sx?: number;
  _sy?: number;
  _ss?: number;
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

/* ── Camera ── */
const PERSP = 900;          // perspective distance — larger = flatter
const ORBIT_SPEED = 0.00012; // radians per ms
const ORBIT_RESUME_MS = 3500;

/** Deterministic depth from id so re-renders never reshuffle the scene. */
function hashDepth(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = ((h * 31) + id.charCodeAt(i)) | 0;
  return (Math.abs(h) % 220) - 110;
}

export function GraphMemoryView({ org }: GraphMemoryViewProps) {
  const orgId = org?.id ?? null;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<GraphData | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [gravityOn, setGravityOn] = useState(true);
  const [orbitOn, setOrbitOn] = useState(true);

  /* ── Refs: everything the 60fps loop reads lives here.
   * The loop effect depends ONLY on [data], so pan / zoom / hover / select
   * never tear down and restart the animation (that restart was the
   * visible "re-render again and again" bug). */
  const viewRef = useRef({ x: 0, y: 0, scale: 1 });
  const hoverIdRef = useRef<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const searchRef = useRef('');
  const typeRef = useRef('all');
  const gravityRef = useRef(true);
  const orbitRef = useRef({ angle: 0.6, auto: true, lastInteract: 0 });
  const centerRef = useRef({ cx: 450, cy: 300 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const draggedNodeRef = useRef<GraphNode | null>(null);
  const simNodesRef = useRef<GraphNode[]>([]);
  const animFrameRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);
  const orbitClockRef = useRef<number>(0);

  // Mirror React state into refs (cheap, never restarts the loop).
  useEffect(() => { selectedIdRef.current = selectedNode?.id ?? null; }, [selectedNode]);
  useEffect(() => { searchRef.current = searchQuery; }, [searchQuery]);
  useEffect(() => { typeRef.current = selectedType; }, [selectedType]);
  useEffect(() => { gravityRef.current = gravityOn; }, [gravityOn]);
  useEffect(() => { orbitRef.current.auto = orbitOn; }, [orbitOn]);

  const fetchGraph = useCallback(async () => {
    try {
      setRefreshing(true);
      const refresh = `refresh=1&refreshAt=${Date.now()}`;
      const url = orgId ? `/api/dashboard/graph?orgId=${orgId}&${refresh}` : `/api/dashboard/graph?${refresh}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch graph data: ${res.statusText}`);
      const json: GraphData = await res.json();
      setData(json);

      const width = containerRef.current?.clientWidth || 900;
      const height = containerRef.current?.clientHeight || 600;
      const cx = width / 2;
      const cy = height / 2;
      centerRef.current = { cx, cy };
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
          z: hashDepth(node.id) + node.importanceScore * 50,
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
  }, [orgId]);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  // Hub set for decluttered labels: top-8 by degree.
  const hubIds = useMemo(() => {
    if (!data) return new Set<string>();
    const degree = new Map<string, number>();
    (data.edges || []).forEach(e => {
      degree.set(e.source, (degree.get(e.source) || 0) + 1);
      degree.set(e.target, (degree.get(e.target) || 0) + 1);
    });
    return new Set(
      [...(data.nodes || [])]
        .sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0))
        .slice(0, 8)
        .map(n => n.id)
    );
  }, [data]);

  const nodeMatchesFilter = (n: GraphNode, query: string, type: string): boolean => {
    const matchesSearch = !query || n.label.toLowerCase().includes(query.toLowerCase());
    const normalizedType = n.type.toLowerCase();
    const matchesType = type === 'all'
      || normalizedType === type.toLowerCase()
      || (type === 'knowledge' && (normalizedType === 'memory' || normalizedType === 'knowledge'))
      || n.isRoot === true;
    return matchesSearch && matchesType;
  };

  /* ── The single render loop. Deps: [data] only. ── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const startTime = performance.now();

    const project = (n: GraphNode, W: number, H: number) => {
      const { cx, cy } = centerRef.current;
      const view = viewRef.current;
      const a = orbitRef.current.angle;
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);
      const dx = (n.x ?? cx) - cx;
      const dy = (n.y ?? cy) - cy;
      const dz = n.z ?? 0;
      const rx = dx * cosA + dz * sinA;
      const rz = -dx * sinA + dz * cosA;
      const s = PERSP / (PERSP + rz);
      return {
        sx: W / 2 + view.x + rx * s * view.scale,
        sy: H / 2 + view.y + dy * s * view.scale,
        s,
        depth: Math.max(0, Math.min(1, (rz + 260) / 520)), // 0 = far, 1 = near
      };
    };

    const render = (time: number) => {
      const elapsed = (time - startTime) / 1000;
      const frameDelta = lastFrameRef.current ? Math.min(2, (time - lastFrameRef.current) / 16.67) : 1;
      lastFrameRef.current = time;
      const simStep = Math.min(0.12, 0.075 * frameDelta);
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }

      // Orbit advance (paused briefly after interaction).
      const orbit = orbitRef.current;
      if (orbitClockRef.current === 0) orbitClockRef.current = time;
      const orbitDelta = Math.min(100, time - orbitClockRef.current);
      orbitClockRef.current = time;
      if (orbit.auto && time - orbit.lastInteract > ORBIT_RESUME_MS) {
        orbit.angle += ORBIT_SPEED * orbitDelta;
      }

      const gravityOnNow = gravityRef.current;
      const hoverId = hoverIdRef.current;
      const selectedId = selectedIdRef.current;
      const query = searchRef.current;
      const type = typeRef.current;

      ctx.save();
      ctx.scale(dpr, dpr);

      const isLight = document.documentElement.getAttribute('data-mm-theme') === 'light';

      // Backdrop + depth vignette.
      ctx.fillStyle = isLight ? '#f7f7f7' : '#050505';
      ctx.fillRect(0, 0, width, height);
      const glow = ctx.createRadialGradient(
        width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * 0.62
      );
      glow.addColorStop(0, isLight ? 'rgba(0,0,0,0.045)' : 'rgba(129,140,248,0.06)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      // Perspective floor rings (static anchor for the 3D read).
      const view = viewRef.current;
      ctx.save();
      ctx.strokeStyle = isLight ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      for (let i = 1; i <= 4; i += 1) {
        ctx.beginPath();
        ctx.setLineDash([2, 7]);
        ctx.ellipse(
          width / 2 + view.x, height / 2 + view.y + 40 * view.scale,
          120 * i * view.scale, 38 * i * view.scale, 0, 0, Math.PI * 2
        );
        ctx.stroke();
      }
      ctx.restore();

      const nodes = simNodesRef.current;

      // 2D force pass in world space (unchanged physics, damped).
      {
        const iterations = gravityOnNow ? 0.34 : 0.18;
        const repulsion = gravityOnNow ? 6200 : 12500;
        const collisionPadding = gravityOnNow ? 34 : 58;
        for (let i = 0; i < nodes.length; i++) {
          const a = nodes[i];
          if (a === draggedNodeRef.current) continue;
          let fx = (centerRef.current.cx - a.x!) * 0.0008;
          let fy = (centerRef.current.cy - a.y!) * 0.0008;
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
          const targetDistance = gravityOnNow ? 142 : 238;
          const force = (distance - targetDistance) * 0.0008;
          if (s !== draggedNodeRef.current) { s.x! += dx * force * simStep; s.y! += dy * force * simStep; }
          if (t !== draggedNodeRef.current) { t.x! -= dx * force * simStep; t.y! -= dy * force * simStep; }
        });
      }

      // Project + depth-sort (far → near painter's order).
      const projected = nodes.map(n => ({ n, p: project(n, width, height) }));
      projected.forEach(({ n, p }) => { n._sx = p.sx; n._sy = p.sy; n._ss = p.s; });
      projected.sort((a, b) => a.p.depth - b.p.depth);
      const byId = new Map(projected.map(({ n, p }) => [n.id, p]));

      // Edges with depth-weighted alpha.
      if (data?.edges) {
        const maxEdges = 400;
        const step = Math.max(1, Math.ceil(data.edges.length / maxEdges));
        for (let ei = 0; ei < data.edges.length; ei += step) {
          const edge = data.edges[ei];
          const ps = byId.get(edge.source);
          const pt = byId.get(edge.target);
          if (!ps || !pt) continue;

          const isHovered = hoverId === edge.source || hoverId === edge.target || selectedId === edge.source || selectedId === edge.target;
          const isDimmed = !!hoverId && !isHovered;
          const depthAlpha = 0.3 + 0.7 * ((ps.depth + pt.depth) / 2);

          ctx.save();
          ctx.beginPath();
          ctx.moveTo(ps.sx, ps.sy);
          ctx.lineTo(pt.sx, pt.sy);

          if (isHovered) {
            ctx.strokeStyle = isLight ? '#111111' : '#ffffff';
            ctx.lineWidth = 2;
            ctx.globalAlpha = 1;
          } else if (isDimmed) {
            ctx.strokeStyle = isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)';
            ctx.lineWidth = 0.8;
            ctx.globalAlpha = 1;
          } else {
            const weak = edge.edgeSource === 'co_occurrence';
            ctx.strokeStyle = isLight ? (weak ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.62)') : (weak ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.6)');
            ctx.lineWidth = weak ? 1 : Math.max(1, Math.min(2.4, 1.1 + (edge.confidence || edge.strength) * 1.3));
            ctx.globalAlpha = depthAlpha;
            if (weak || !edge.isValid) ctx.setLineDash([4, 5]);
          }
          ctx.stroke();
          ctx.restore();

          // Flow pulse on strong valid edges only.
          if (edge.isValid && !isDimmed && edge.edgeSource !== 'co_occurrence') {
            const progress = (elapsed * 0.3 + (ps.sx * 0.002)) % 1;
            const px = ps.sx + (pt.sx - ps.sx) * progress;
            const py = ps.sy + (pt.sy - ps.sy) * progress;
            ctx.save();
            ctx.globalAlpha = 0.5 + 0.5 * depthAlpha;
            ctx.beginPath();
            ctx.arc(px, py, 1.6, 0, Math.PI * 2);
            ctx.fillStyle = isHovered ? '#ffffff' : (isLight ? '#333333' : '#d4d4d4');
            ctx.fill();
            ctx.restore();
          }
        }
      }

      // Nodes, far → near.
      const q = query.trim().toLowerCase();
      projected.forEach(({ n, p }) => {
        const matched = nodeMatchesFilter(n, query, type);
        const isHovered = hoverId === n.id;
        const isSelected = selectedId === n.id;
        const baseR = n.radius || 18;
        const r = Math.max(3, baseR * p.s * view.scale);
        const showLabel = isHovered || isSelected || hubIds.has(n.id) || (!!q && n.label.toLowerCase().includes(q));

        ctx.save();
        ctx.globalAlpha = matched ? (0.45 + 0.55 * p.depth) : 0.15;

        // Halo (depth-scaled).
        const haloR = r * 2.6;
        const halo = ctx.createRadialGradient(p.sx, p.sy, r * 0.4, p.sx, p.sy, haloR);
        const haloColor = isLight ? 'rgba(0,0,0,0.10)' : 'rgba(129,140,248,0.20)';
        halo.addColorStop(0, haloColor);
        halo.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, haloR, 0, Math.PI * 2);
        ctx.fill();

        // Core.
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
        ctx.fillStyle = isLight ? (isSelected ? '#111111' : '#d5d5d5') : (isSelected ? '#f5f5f5' : '#242424');
        ctx.strokeStyle = isHovered || isSelected ? (isLight ? '#000000' : '#ffffff') : (isLight ? '#555555' : '#9a9a9a');
        ctx.lineWidth = isHovered || isSelected ? 2 : 1;
        ctx.fill();
        ctx.stroke();

        // Compact label pill — hubs / hover / selection / search hits only.
        if (showLabel) {
          ctx.font = '500 10.5px "Inter", sans-serif';
          const pillWidth = ctx.measureText(n.label).width + 16;
          const pillHeight = 22;
          const pillX = p.sx - pillWidth / 2;
          const pillY = p.sy - r - 24;
          ctx.save();
          ctx.globalAlpha = 1;
          ctx.fillStyle = isLight
            ? (isHovered || isSelected ? 'rgba(255,255,255,1)' : 'rgba(245,245,248,0.95)')
            : (isHovered || isSelected ? 'rgba(24,24,32,0.96)' : 'rgba(12,12,16,0.9)');
          ctx.beginPath();
          roundRect(ctx, pillX, pillY, pillWidth, pillHeight, 5);
          ctx.fill();
          ctx.strokeStyle = (isHovered || isSelected)
            ? (isLight ? '#111111' : '#ffffff')
            : (isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.14)');
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.fillStyle = isLight ? '#111111' : (isHovered || isSelected ? '#ffffff' : '#e5e5e5');
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(n.label, p.sx, pillY + pillHeight / 2);
          ctx.restore();
        }
        ctx.restore();
      });

      ctx.restore();
      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animFrameRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

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

  const markInteract = () => { orbitRef.current.lastInteract = performance.now(); };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    markInteract();
    const rect = canvas.getBoundingClientRect();

    const clickedNode = simNodesRef.current.find(n => {
      if (n._sx == null || n._sy == null) return false;
      const dx = (e.clientX - rect.left) - n._sx;
      const dy = (e.clientY - rect.top) - n._sy;
      return Math.sqrt(dx * dx + dy * dy) <= Math.max(10, (n.radius || 18) * (n._ss || 1) * viewRef.current.scale) + 8;
    });

    if (clickedNode) {
      draggedNodeRef.current = clickedNode;
      setSelectedNode(clickedNode);
    } else {
      isDraggingRef.current = true;
      dragStartRef.current = { x: e.clientX - viewRef.current.x, y: e.clientY - viewRef.current.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (draggedNodeRef.current) {
      markInteract();
      // Approximate inverse projection using the node's own depth scale.
      const node = draggedNodeRef.current;
      const s = node._ss || 1;
      const view = viewRef.current;
      const a = orbitRef.current.angle;
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);
      const { cx, cy } = centerRef.current;
      const rx = (mx - rect.width / 2 - view.x) / (s * view.scale);
      const ry = (my - rect.height / 2 - view.y) / (s * view.scale);
      const dz = node.z ?? 0;
      const dx = Math.abs(cosA) > 0.05 ? (rx - dz * sinA) / cosA : rx;
      node.x = dx + cx;
      node.y = ry + cy;
      return;
    }

    if (isDraggingRef.current) {
      markInteract();
      viewRef.current.x = e.clientX - dragStartRef.current.x;
      viewRef.current.y = e.clientY - dragStartRef.current.y;
      return;
    }

    const hovered = simNodesRef.current.find(n => {
      if (n._sx == null || n._sy == null) return false;
      const dx = mx - n._sx;
      const dy = my - n._sy;
      return Math.sqrt(dx * dx + dy * dy) <= Math.max(10, (n.radius || 18) * (n._ss || 1) * viewRef.current.scale) + 6;
    });

    const nextId = hovered ? hovered.id : null;
    if (hoverIdRef.current !== nextId) {
      hoverIdRef.current = nextId;
      canvas.style.cursor = nextId ? 'pointer' : 'grab';
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    draggedNodeRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    markInteract();
    const view = viewRef.current;
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    view.scale = Math.min(Math.max(view.scale * zoomFactor, 0.4), 3.0);
  };

  const zoomBy = (factor: number) => {
    markInteract();
    const view = viewRef.current;
    view.scale = Math.min(Math.max(view.scale * factor, 0.4), 3.0);
  };

  const resetZoom = () => {
    markInteract();
    viewRef.current = { x: 0, y: 0, scale: 1 };
  };

  const toggleOrbit = () => {
    markInteract();
    setOrbitOn(v => !v);
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
            onClick={toggleOrbit}
            aria-pressed={orbitOn}
            className="mm-graph-btn"
            title={orbitOn ? 'Pause the orbital rotation' : 'Resume the orbital rotation'}
          >
            <Orbit size={13} />
            <span>Orbit</span>
            <span className="mm-graph-toggle-state">{orbitOn ? 'On' : 'Off'}</span>
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
              onClick={() => zoomBy(1.2)}
              className="mm-graph-zoom-btn"
              title="Zoom In"
            >
              <ZoomIn size={14} />
            </button>
            <button
              onClick={() => zoomBy(0.8)}
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
