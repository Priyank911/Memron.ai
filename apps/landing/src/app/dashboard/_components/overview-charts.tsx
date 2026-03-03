'use client';

import { DonutChart, BarChart } from './charts';

interface OverviewChartsProps {
  containerTags: { value: number; color: string; label: string }[];
  tokenUsage: { label: string; value: number }[];
  requestTypes: { value: number; color: string; label: string }[];
  totalTags: number;
  totalDocs: number;
  dateRange: string;
}

export function OverviewCharts({
  containerTags,
  tokenUsage,
  requestTypes,
  totalTags,
  totalDocs,
  dateRange,
}: OverviewChartsProps) {
  return (
    <div className="db-charts-grid">
      {/* Bucket Distribution */}
      <div className="db-card">
        <div className="db-card-header">
          <h3 className="db-card-title">Bucket Distribution</h3>
          <p className="db-card-subtitle">Distribution of memories across different buckets</p>
        </div>
        <div className="db-card-body" style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
          <DonutChart
            segments={containerTags}
            size={140}
            thickness={18}
            centerValue={totalDocs}
            centerLabel="Memories"
          />
        </div>
        <div className="db-card-footer">
          <span>Total Buckets: <strong>{totalTags}</strong></span>
          <span>Total Memories: <strong>{totalDocs}</strong></span>
        </div>
      </div>

      {/* Token Usage */}
      <div className="db-card">
        <div className="db-card-header">
          <h3 className="db-card-title">Token Usage</h3>
          <p className="db-card-subtitle">{tokenUsage.reduce((s, d) => s + d.value, 0).toLocaleString()} tokens processed over the last 7 days</p>
        </div>
        <div className="db-card-body" style={{ padding: '16px 0' }}>
          <BarChart data={tokenUsage} height={130} barWidth={28} gap={8} color="#3b82f6" />
        </div>
      </div>

      {/* Memory Types */}
      <div className="db-card">
        <div className="db-card-header">
          <h3 className="db-card-title">Memory Types</h3>
          <p className="db-card-subtitle">Distribution of memory categories</p>
        </div>
        <div className="db-card-body" style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
          <DonutChart
            segments={requestTypes}
            size={140}
            thickness={18}
          />
        </div>
      </div>
    </div>
  );
}
