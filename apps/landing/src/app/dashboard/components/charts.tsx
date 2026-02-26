'use client';

import { useMemo } from 'react';

interface MiniBarChartProps {
  data: { label: string; value: number; color?: string }[];
  height?: number;
  className?: string;
  barWidth?: number;
  gap?: number;
}

export function MiniBarChart({
  data,
  height = 64,
  className = '',
  barWidth = 16,
  gap = 4,
}: MiniBarChartProps) {
  const max = useMemo(() => Math.max(...data.map(d => d.value), 1), [data]);
  const totalWidth = data.length * (barWidth + gap) - gap;

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <svg width={totalWidth} height={height} viewBox={`0 0 ${totalWidth} ${height}`}>
        {data.map((d, i) => {
          const barH = Math.max((d.value / max) * (height - 4), 2);
          const x = i * (barWidth + gap);
          const color = d.color || '#6366f1';
          return (
            <g key={i}>
              {/* Background bar */}
              <rect
                x={x}
                y={0}
                width={barWidth}
                height={height}
                rx={3}
                fill="rgba(255,255,255,0.04)"
              />
              {/* Value bar */}
              <rect
                x={x}
                y={height - barH}
                width={barWidth}
                height={barH}
                rx={3}
                fill={color}
                opacity={0.85}
              />
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', gap: gap }}>
        {data.map((d, i) => (
          <span
            key={i}
            style={{
              width: barWidth,
              fontSize: 8,
              color: 'rgba(161,161,170,0.7)',
              textAlign: 'center',
              lineHeight: '10px',
            }}
          >
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

interface DonutChartProps {
  segments: { value: number; color: string; label: string }[];
  size?: number;
  thickness?: number;
  className?: string;
}

export function DonutChart({
  segments,
  size = 80,
  thickness = 10,
  className = '',
}: DonutChartProps) {
  const total = useMemo(() => segments.reduce((sum, s) => sum + s.value, 0), [segments]);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  let accumulated = 0;

  return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={thickness}
        />
        {total > 0 &&
          segments.map((seg, i) => {
            const pct = seg.value / total;
            const dashLen = pct * circumference;
            const dashOffset = -(accumulated / total) * circumference;
            accumulated += seg.value;
            return (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={seg.color}
                strokeWidth={thickness}
                strokeDasharray={`${dashLen} ${circumference - dashLen}`}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
                style={{
                  transform: 'rotate(-90deg)',
                  transformOrigin: '50% 50%',
                  transition: 'stroke-dasharray 0.6s ease',
                }}
              />
            );
          })}
        {/* Center text */}
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill="white"
          fontSize={14}
          fontWeight={700}
          fontFamily="'Space Grotesk', sans-serif"
        >
          {total}
        </text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {segments.map((seg, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: seg.color,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 11, color: '#a1a1aa' }}>{seg.label}</span>
            <span style={{ fontSize: 11, color: '#fff', fontWeight: 600, marginLeft: 'auto' }}>
              {seg.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface HeatmapProps {
  data: number[][]; // 7 rows (days) x N cols (hours)
  labels?: { rows?: string[]; cols?: string[] };
  cellSize?: number;
  gap?: number;
  colorScale?: string[];
  className?: string;
}

export function Heatmap({
  data,
  labels,
  cellSize = 12,
  gap = 2,
  colorScale = ['rgba(99,102,241,0.05)', 'rgba(99,102,241,0.2)', 'rgba(99,102,241,0.4)', 'rgba(99,102,241,0.65)', '#6366f1'],
  className = '',
}: HeatmapProps) {
  const flat = data.flat();
  const maxVal = Math.max(...flat, 1);

  const getColor = (v: number) => {
    if (v === 0) return colorScale[0];
    const idx = Math.min(Math.floor((v / maxVal) * (colorScale.length - 1)), colorScale.length - 1);
    return colorScale[idx];
  };

  const cols = data[0]?.length || 0;
  const rows = data.length;
  const labelW = labels?.rows ? 24 : 0;
  const totalW = labelW + cols * (cellSize + gap) - gap;
  const totalH = rows * (cellSize + gap) - gap + (labels?.cols ? 16 : 0);

  return (
    <svg width={totalW} height={totalH} className={className}>
      {labels?.rows &&
        data.map((_, r) => (
          <text
            key={`rl-${r}`}
            x={0}
            y={r * (cellSize + gap) + cellSize / 2}
            dominantBaseline="central"
            fontSize={8}
            fill="#71717a"
          >
            {labels.rows![r] || ''}
          </text>
        ))}
      {data.map((row, r) =>
        row.map((v, c) => (
          <rect
            key={`${r}-${c}`}
            x={labelW + c * (cellSize + gap)}
            y={r * (cellSize + gap)}
            width={cellSize}
            height={cellSize}
            rx={2}
            fill={getColor(v)}
            style={{ transition: 'fill 0.3s ease' }}
          >
            <title>{`${labels?.rows?.[r] || `Day ${r}`}, ${labels?.cols?.[c] || `Hour ${c}`}: ${v}`}</title>
          </rect>
        ))
      )}
      {labels?.cols &&
        labels.cols.map((l, c) => (
          <text
            key={`cl-${c}`}
            x={labelW + c * (cellSize + gap) + cellSize / 2}
            y={rows * (cellSize + gap) + 4}
            textAnchor="middle"
            dominantBaseline="hanging"
            fontSize={7}
            fill="#52525b"
          >
            {l}
          </text>
        ))}
    </svg>
  );
}

interface AreaChartProps {
  data: { label: string; value: number }[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
  showGrid?: boolean;
  showLabels?: boolean;
}

export function AreaChart({
  data,
  width = 300,
  height = 120,
  color = '#6366f1',
  className = '',
  showGrid = true,
  showLabels = true,
}: AreaChartProps) {
  const paddingLeft = showLabels ? 32 : 0;
  const paddingBottom = showLabels ? 20 : 0;
  const chartW = width - paddingLeft;
  const chartH = height - paddingBottom;

  const max = useMemo(() => Math.max(...data.map(d => d.value), 1), [data]);

  const points = useMemo(() => {
    const step = chartW / Math.max(data.length - 1, 1);
    return data.map((d, i) => ({
      x: paddingLeft + i * step,
      y: chartH - (d.value / max) * (chartH - 8) - 4,
    }));
  }, [data, chartW, chartH, max, paddingLeft]);

  const linePath = useMemo(() => {
    if (!points.length) return '';
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx = (prev.x + curr.x) / 2;
      d += ` C ${cpx} ${prev.y}, ${cpx} ${curr.y}, ${curr.x} ${curr.y}`;
    }
    return d;
  }, [points]);

  const fillPath = useMemo(() => {
    if (!linePath) return '';
    return `${linePath} L ${points[points.length - 1].x} ${chartH} L ${points[0].x} ${chartH} Z`;
  }, [linePath, points, chartH]);

  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className}>
      <defs>
        <linearGradient id={`area-fill-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>

      {showGrid &&
        gridLines.map((pct, i) => {
          const y = chartH - pct * (chartH - 8) - 4;
          return (
            <g key={i}>
              <line
                x1={paddingLeft}
                y1={y}
                x2={width}
                y2={y}
                stroke="rgba(255,255,255,0.04)"
                strokeDasharray="3 3"
              />
              {showLabels && (
                <text x={paddingLeft - 6} y={y} textAnchor="end" dominantBaseline="central" fontSize={9} fill="#52525b">
                  {Math.round(pct * max)}
                </text>
              )}
            </g>
          );
        })}

      <path d={fillPath} fill={`url(#area-fill-${color.replace('#', '')})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" />

      {/* Data points */}
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2} fill={color} opacity={0.8}>
          <title>{`${data[i].label}: ${data[i].value}`}</title>
        </circle>
      ))}

      {showLabels &&
        data.map((d, i) => {
          // Show every other label to prevent overlap
          if (data.length > 8 && i % 2 !== 0 && i !== data.length - 1) return null;
          return (
            <text
              key={i}
              x={points[i].x}
              y={chartH + 12}
              textAnchor="middle"
              fontSize={8}
              fill="#52525b"
            >
              {d.label}
            </text>
          );
        })}
    </svg>
  );
}
