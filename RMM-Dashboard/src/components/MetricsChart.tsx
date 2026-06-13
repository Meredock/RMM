"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { format } from "date-fns";

interface MetricPoint {
  timestamp: string;
  cpuPercent: number;
  ramPercent: number;
  diskPercent: number;
}

interface MetricsChartProps {
  data: MetricPoint[];
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string; payload: { timestamp: string } }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 text-xs shadow-lg">
      <p className="text-muted-foreground mb-2">
        {payload?.[0]?.payload?.timestamp
          ? format(new Date(payload[0].payload.timestamp), "MMM d, HH:mm")
          : ""}
      </p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-foreground capitalize">{entry.name}:</span>
          <span className="font-medium" style={{ color: entry.color }}>
            {entry.value.toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}

export function MetricsChart({ data }: MetricsChartProps) {
  if (!data.length) {
    return (
      <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
        No metric data available
      </div>
    );
  }

  const formatted = data.map((d) => {
    const ts = new Date(d.timestamp);
    return {
      ...d,
      time: d.timestamp,
      displayTime: isNaN(ts.getTime()) ? "" : format(ts, "HH:mm"),
    };
  });

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={formatted} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(217 33% 22%)" />
        <XAxis
          dataKey="displayTime"
          tick={{ fill: "hsl(215 20% 55%)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fill: "hsl(215 20% 55%)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
          formatter={(value) => (
            <span style={{ color: "hsl(215 20% 55%)" }}>{value.toUpperCase()}</span>
          )}
        />
        <Line
          type="monotone"
          dataKey="cpuPercent"
          name="cpu"
          stroke="hsl(212 100% 47%)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="ramPercent"
          name="ram"
          stroke="hsl(142 71% 45%)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="diskPercent"
          name="disk"
          stroke="hsl(38 92% 50%)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
