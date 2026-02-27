import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const WITH_COLOR = '#818cf8';    // indigo-400
const WITHOUT_COLOR = '#34d399'; // emerald-400

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
        <p key={p.dataKey} style={{ margin: '0.15rem 0', color: p.fill }}>
          {p.name}: <strong>{p.value.toLocaleString()}</strong>
          {p.payload[p.dataKey === 'withKeyword' ? 'withCount' : 'withoutCount'] !== undefined && (
            <span style={{ opacity: 0.55, marginLeft: 6 }}>
              (n={p.payload[p.dataKey === 'withKeyword' ? 'withCount' : 'withoutCount']})
            </span>
          )}
        </p>
      ))}
    </div>
  );
}

export default function EngagementChart({ data, metricColumn = 'Favorite Count' }) {
  console.log('[EngagementChart] render called, data:', data);
  if (!data?.length) {
    console.warn('[EngagementChart] no data — chart will not render');
    return null;
  }

  return (
    <div className="engagement-chart-wrap">
      <p className="engagement-chart-label">
        Mean {metricColumn} — with vs without keyword
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart
          data={data}
          margin={{ top: 8, right: 16, left: 0, bottom: 64 }}
          barCategoryGap="30%"
          barGap={4}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.07)"
            vertical={false}
          />
          <XAxis
            dataKey="name"
            tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 11, fontFamily: 'Inter,sans-serif' }}
            axisLine={{ stroke: 'rgba(255,255,255,0.12)' }}
            tickLine={false}
            angle={-30}
            textAnchor="end"
            interval={0}
          />
          <YAxis
            tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: 'Inter,sans-serif' }}
            axisLine={false}
            tickLine={false}
            width={55}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
          <Legend
            wrapperStyle={{
              paddingTop: 12,
              fontSize: 12,
              fontFamily: 'Inter,sans-serif',
              color: 'rgba(255,255,255,0.65)',
            }}
          />
          <Bar dataKey="withKeyword" name="With keyword" fill={WITH_COLOR} radius={[5, 5, 0, 0]} />
          <Bar dataKey="withoutKeyword" name="Without keyword" fill={WITHOUT_COLOR} radius={[5, 5, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
