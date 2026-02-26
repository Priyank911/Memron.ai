'use client';

import { Sparkline } from './charts';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string;
  delta: number;
  deltaSuffix?: string;
  sparkData: number[];
  sparkColor?: string;
  /** e.g. "127 / 1.0M" */
  quota?: string;
}

export function StatCard({ label, value, delta, deltaSuffix = '%', sparkData, sparkColor = '#3b82f6', quota }: StatCardProps) {
  const isUp = delta >= 0;

  return (
    <div className="db-stat-card">
      <div className="db-stat-card-header">
        <span className="db-stat-card-label">{label}</span>
        {quota && <span className="db-stat-card-quota">{quota}</span>}
      </div>

      <div className="db-stat-card-body">
        <div className="db-stat-card-left">
          <span className="db-stat-card-value">{value}</span>
          <span className={`db-stat-card-delta ${isUp ? 'up' : 'down'}`}>
            {isUp ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
            {isUp ? '+' : ''}{delta}{deltaSuffix}
          </span>
        </div>
        <Sparkline data={sparkData} color={sparkColor} width={72} height={22} />
      </div>
    </div>
  );
}

interface StatsRowProps {
  stats: StatCardProps[];
}

export function StatsRow({ stats }: StatsRowProps) {
  return (
    <div className="db-stats-grid">
      {stats.map((s, i) => (
        <StatCard key={i} {...s} />
      ))}
    </div>
  );
}
