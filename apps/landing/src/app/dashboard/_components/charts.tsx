'use client';

import { useMemo } from 'react';

/* ═══════════════════════════════════════════════
   Sparkline — minimal SVG trend line
   ═══════════════════════════════════════════════ */

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  strokeWidth?: number;
}

export function Sparkline({
  data,
  width = 80,
  height = 24,
  color = '#3b82f6',
  strokeWidth = 1.5,
}: SparklineProps) {
  const path = useMemo(() => {
    if (data.length < 2) return '';
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const step = width / (data.length - 1);
    const pts = data.map((v, i) => ({
      x: i * step,
      y: height - ((v - min) / range) * (height - 4) - 2,
    }));
    let d = `M${pts[0].x},${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const cpx = (pts[i - 1].x + pts[i].x) / 2;
      d += ` C${cpx},${pts[i - 1].y} ${cpx},${pts[i].y} ${pts[i].x},${pts[i].y}`;
    }
    return d;
  }, [data, width, height]);

  if (data.length < 2) return null;

  const id = `sf-${color.replace('#', '')}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.15} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${path} L${width},${height} L0,${height} Z`} fill={`url(#${id})`} />
      <path d={path} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════
   DonutChart — ring chart with center label + legend
   ═══════════════════════════════════════════════ */

interface DonutSegment { value: number; color: string; label: string }

interface DonutChartProps {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string | number;
}

export function DonutChart({
  segments,
  size = 120,
  thickness = 14,
  centerLabel,
  centerValue,
}: DonutChartProps) {
  const total = useMemo(() => segments.reduce((s, x) => s + x.value, 0), [segments]);
  const r = (size - thickness) / 2;
  const circ = 2 * Math.PI * r;
  const cx = size / 2;

  const { arcs } = segments.reduce((acc, seg) => {
    const pct = seg.value / (total || 1);
    const dash = pct * circ;
    const o = acc.offset;
    acc.arcs.push({ ...seg, dash, gap: circ - dash, offset: o });
    acc.offset += dash;
    return acc;
  }, { arcs: [] as (DonutSegment & { dash: number; gap: number; offset: number })[], offset: 0 });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
          {/* track */}
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--mm-donut-track, rgba(120,120,120,0.15))" strokeWidth={thickness} />
          {arcs.map((a, i) => (
            <circle
              key={i}
              cx={cx}
              cy={cx}
              r={r}
              fill="none"
              stroke={a.color}
              strokeWidth={thickness}
              strokeDasharray={`${a.dash} ${a.gap}`}
              strokeDashoffset={-a.offset}
              strokeLinecap="round"
            />
          ))}
        </svg>
        {centerValue !== undefined && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--mm-text)', fontFamily: "'Space Grotesk',sans-serif", lineHeight: 1 }}>{centerValue}</span>
            {centerLabel && <span style={{ fontSize: 10, color: 'var(--mm-text-2)', marginTop: 2 }}>{centerLabel}</span>}
          </div>
        )}
      </div>

      {/* legend */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {segments.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: 'var(--mm-text-2)' }}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   BarChart — vertical bars for token usage over time
   ═══════════════════════════════════════════════ */

interface BarChartProps {
  data: { label: string; value: number }[];
  height?: number;
  barWidth?: number;
  gap?: number;
  color?: string;
  width?: number;
}

export function BarChart({
  data,
  height = 120,
  barWidth = 32,
  gap = 8,
  color = '#3b82f6',
  width: containerWidth,
}: BarChartProps) {
  const max = useMemo(() => Math.max(...data.map((d) => d.value), 1), [data]);
  const totalW = containerWidth || data.length * (barWidth + gap) - gap;

  // Y-axis labels
  const steps = 5;
  const yLabels = Array.from({ length: steps + 1 }, (_, i) => Math.round((max / steps) * (steps - i)));

  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {/* Y axis */}
      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height, paddingRight: 4 }}>
        {yLabels.map((v, i) => (
          <span key={i} style={{ fontSize: 9, color: '#52525b', textAlign: 'right', lineHeight: '10px', minWidth: 20 }}>{v}</span>
        ))}
      </div>

      <div style={{ flex: 1 }}>
        {/* Grid lines */}
        <div style={{ position: 'relative', height }}>
          {yLabels.map((_, i) => (
            <div key={i} style={{
              position: 'absolute', left: 0, right: 0,
              top: `${(i / steps) * 100}%`,
              borderTop: '1px solid rgba(255,255,255,0.04)',
            }} />
          ))}

          {/* Bars */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap, height: '100%', position: 'relative', zIndex: 1 }}>
            {data.map((d, i) => {
              const barH = Math.max((d.value / max) * height, 1);
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                  <div style={{ width: barWidth, height: barH, background: color, borderRadius: '4px 4px 0 0', opacity: 0.85 }} />
                </div>
              );
            })}
          </div>
        </div>

        {/* X labels */}
        <div style={{ display: 'flex', gap, marginTop: 6 }}>
          {data.map((d, i) => (
            <span key={i} style={{ flex: 1, textAlign: 'center', fontSize: 10, color: '#71717a' }}>{d.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
