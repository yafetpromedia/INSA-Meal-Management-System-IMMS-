'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const MEAL_COLORS = ['#0a0a0a', '#52525b', '#a1a1aa'];
const MODULE_COLORS = ['#15803d', '#b45309', '#334155', '#0a0a0a'];

type TooltipPayload = { name?: string; value?: number; color?: string };

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="dash-chart-tip">
      {label ? <strong>{label}</strong> : null}
      {payload.map((p) => (
        <div key={String(p.name)}>
          <span style={{ background: p.color }} />
          {p.name}: <b>{p.value ?? 0}</b>
        </div>
      ))}
    </div>
  );
}

export function MealSessionsChart({
  data,
  roster,
}: {
  data: Array<{ name: string; served: number; active?: boolean }>;
  roster: number;
}) {
  return (
    <div className="dash-chart">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
          <XAxis
            dataKey="name"
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--muted)', fontSize: 12 }}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--muted)', fontSize: 12 }}
            width={36}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ fill: 'var(--accent-soft)' }}
          />
          <Bar dataKey="served" name="Served" radius={[8, 8, 0, 0]} maxBarSize={48}>
            {data.map((entry, i) => (
              <Cell
                key={entry.name}
                fill={entry.active ? 'var(--success)' : MEAL_COLORS[i % MEAL_COLORS.length]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {roster > 0 ? (
        <p className="dash-chart-foot muted">Roster size {roster} · bars show meals served today</p>
      ) : null}
    </div>
  );
}

export function CoverageDonut({
  served,
  remaining,
  label,
}: {
  served: number;
  remaining: number;
  label: string;
}) {
  const data = [
    { name: 'Served', value: served },
    { name: 'Remaining', value: Math.max(0, remaining) },
  ];
  const total = served + Math.max(0, remaining);
  const pct = total ? Math.round((served / total) * 100) : 0;

  return (
    <div className="dash-donut-wrap">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={62}
            outerRadius={86}
            paddingAngle={3}
            stroke="none"
          >
            <Cell fill="var(--success)" />
            <Cell fill="var(--border)" />
          </Pie>
          <Tooltip content={<ChartTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="dash-donut-center">
        <strong>{pct}%</strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

export function ModuleBarsChart({
  data,
}: {
  data: Array<{ name: string; value: number }>;
}) {
  if (!data.length) return null;
  return (
    <div className="dash-chart">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart
          layout="vertical"
          data={data}
          margin={{ top: 4, right: 12, left: 4, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
          <XAxis
            type="number"
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--muted)', fontSize: 12 }}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={88}
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--accent-soft)' }} />
          <Bar dataKey="value" name="Count" radius={[0, 8, 8, 0]} maxBarSize={22}>
            {data.map((entry, i) => (
              <Cell key={entry.name} fill={MODULE_COLORS[i % MODULE_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
