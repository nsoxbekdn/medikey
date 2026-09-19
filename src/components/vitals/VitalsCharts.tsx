"use client";

import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { VitalsPoint } from "@/lib/db/types";
import { statsFor } from "@/lib/vitals/stats";
import { downsampleForChart } from "@/lib/vitals/downsample";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SERIES: Array<{ title: string; fields: Array<{ key: keyof VitalsPoint; label: string; color: string }> }> = [
  {
    title: "Blood pressure",
    fields: [
      { key: "systolic", label: "Systolic", color: "var(--chart-1)" },
      { key: "diastolic", label: "Diastolic", color: "var(--chart-2)" },
    ],
  },
  { title: "Heart rate", fields: [{ key: "heartRate", label: "Heart rate", color: "var(--chart-3)" }] },
  { title: "Glucose", fields: [{ key: "glucose", label: "Glucose", color: "var(--chart-4)" }] },
  { title: "SpO2", fields: [{ key: "spo2", label: "SpO2", color: "var(--chart-1)" }] },
  { title: "Weight", fields: [{ key: "weight", label: "Weight", color: "var(--chart-5)" }] },
];

// Display-only cap: charts render at most this many points regardless of dataset
// size. Stats (below) always use the full `points` array passed in.
const MAX_CHART_POINTS = 500;

function VitalSeriesCard({
  title,
  fields,
  points,
}: {
  title: string;
  fields: (typeof SERIES)[number]["fields"];
  points: VitalsPoint[];
}) {
  const primaryField = fields[0].key as Exclude<keyof VitalsPoint, "timestamp">;

  // Full-dataset stats — never computed from downsampled display data.
  const stats = useMemo(() => statsFor(points, primaryField), [points, primaryField]);

  const chartData = useMemo(() => {
    const fieldKeys = fields.map((f) => f.key as Exclude<keyof VitalsPoint, "timestamp">);
    const source = downsampleForChart(points, fieldKeys, MAX_CHART_POINTS);
    return source.map((p) => ({ ...p, label: new Date(p.timestamp).toLocaleDateString() }));
  }, [points, fields]);

  const showDots = chartData.length <= 60;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex flex-wrap gap-6 text-sm text-muted-foreground">
          <span>Latest: {stats.latest ?? "—"}</span>
          <span>Min: {stats.min ?? "—"}</span>
          <span>Max: {stats.max ?? "—"}</span>
          <span>Avg: {stats.avg ?? "—"}</span>
          <span>{stats.count} observations{chartData.length < points.length && ` (${chartData.length} shown)`}</span>
        </div>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} domain={["auto", "auto"]} />
              <Tooltip />
              <Legend />
              {fields.map((f) => (
                <Line
                  key={String(f.key)}
                  type="monotone"
                  dataKey={f.key as string}
                  name={f.label}
                  stroke={f.color}
                  strokeWidth={2}
                  dot={showDots ? { r: 3 } : false}
                  isAnimationActive={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export function VitalsCharts({ points }: { points: VitalsPoint[] }) {
  const visibleSeries = useMemo(
    () => SERIES.filter((series) => points.some((p) => series.fields.some((f) => typeof p[f.key] === "number"))),
    [points],
  );

  return (
    <div className="space-y-6">
      {visibleSeries.map((series) => (
        <VitalSeriesCard key={series.title} title={series.title} fields={series.fields} points={points} />
      ))}
    </div>
  );
}
