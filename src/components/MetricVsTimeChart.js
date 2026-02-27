import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(15, 15, 35, 0.92)',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 10,
      padding: '0.65rem 0.9rem',
      fontSize: '0.82rem',
      fontFamily: 'Inter, sans-serif',
      color: '#e2e8f0',
      boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    }}>
      <p style={{ margin: '0 0 0.4rem', fontWeight: 700, color: '#fff' }}>{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ margin: '0.15rem 0', color: p.stroke }}>
          {p.name}: <strong>{Number(p.value).toLocaleString()}</strong>
        </p>
      ))}
    </div>
  );
}

export default function MetricVsTimeChart({ data, metricField }) {
  const [enlarged, setEnlarged] = useState(false);
  if (!data?.length) return null;

  const chartData = data.map((d) => ({ ...d, name: d.label, value: d.value }));

  const chartContent = (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart
        data={chartData}
        margin={{ top: 8, right: 16, left: 0, bottom: 64 }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="rgba(255,255,255,0.07)"
          vertical={false}
        />
        <XAxis
          dataKey="name"
          tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 11 }}
          axisLine={{ stroke: 'rgba(255,255,255,0.12)' }}
          tickLine={false}
          angle={-30}
          textAnchor="end"
          interval={0}
        />
        <YAxis
          tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={55}
          tickFormatter={(v) => v >= 1000000 ? (v / 1000000) + 'M' : v >= 1000 ? (v / 1000) + 'K' : v}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
        <Line
          type="monotone"
          dataKey="value"
          name={metricField || 'Value'}
          stroke="#818cf8"
          strokeWidth={2}
          dot={{ fill: '#818cf8', r: 4 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );

  const handleDownload = (e) => {
    e.stopPropagation();
    const wrap = document.querySelector('.metric-vs-time-chart-wrap.enlarged');
    const svg = wrap?.querySelector('svg');
    if (svg) {
      const svgData = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `plot_${metricField || 'metric'}_vs_time.svg`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className={`metric-vs-time-chart-wrap metric-vs-time-chart ${enlarged ? 'enlarged' : ''}`}>
      <div
        className="metric-vs-time-chart-inner"
        onClick={() => setEnlarged(!enlarged)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && setEnlarged(!enlarged)}
      >
        <p className="metric-vs-time-label">
          {metricField || 'Metric'} vs Time
        </p>
        {chartContent}
        {enlarged && (
          <div className="metric-vs-time-actions">
            <button type="button" onClick={handleDownload}>
              Download
            </button>
            <button type="button" onClick={(e) => { e.stopPropagation(); setEnlarged(false); }}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
