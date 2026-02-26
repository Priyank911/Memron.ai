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
      {/* Container Tags Distribution */}
      <div className="db-card">
        <div className="db-card-header">
          <h3 className="db-card-title">Container Tags Distribution</h3>
          <p className="db-card-subtitle">Distribution of documents across different container tags</p>
        </div>
        <div className="db-card-body" style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
          <DonutChart
            segments={containerTags}
            size={140}
            thickness={18}
            centerValue={totalDocs}
            centerLabel="Documents"
          />
        </div>
        <div className="db-card-footer">
          <span>Total Tags: <strong>{totalTags}</strong></span>
          <span>Total Documents: <strong>{totalDocs}</strong></span>
        </div>
      </div>

      {/* Token Usage */}
      <div className="db-card">
        <div className="db-card-header">
          <h3 className="db-card-title">Token Usage</h3>
          <p className="db-card-subtitle">0 tokens processed over the last 7 days</p>
        </div>
        <div className="db-card-body" style={{ padding: '16px 0' }}>
          <BarChart data={tokenUsage} height={130} barWidth={28} gap={8} color="#3b82f6" />
        </div>
      </div>

      {/* Request Types */}
      <div className="db-card">
        <div className="db-card-header">
          <h3 className="db-card-title">Request Types</h3>
          <p className="db-card-subtitle">Distribution of API request types</p>
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
