"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { VitalsPoint } from "@/lib/db/types";
import { statsFor } from "@/lib/vitals/stats";
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

export function VitalsCharts({ points }: { points: VitalsPoint[] }) {
  const chartData = points.map((p) => ({ ...p, label: new Date(p.timestamp).toLocaleDateString() }));

  return (
    <div className="space-y-6">
      {SERIES.map((series) => {
        const hasData = points.some((p) => series.fields.some((f) => typeof p[f.key] === "number"));
        if (!hasData) return null;
        const primaryField = series.fields[0].key as Exclude<keyof VitalsPoint, "timestamp">;
        const stats = statsFor(points, primaryField);
        return (
          <Card key={series.title}>
            <CardHeader>
              <CardTitle className="text-base">{series.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-3 flex gap-6 text-sm text-muted-foreground">
                <span>Latest: {stats.latest ?? "—"}</span>
                <span>Min: {stats.min ?? "—"}</span>
                <span>Max: {stats.max ?? "—"}</span>
                <span>Avg: {stats.avg ?? "—"}</span>
                <span>{stats.count} observations</span>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} domain={["auto", "auto"]} />
                    <Tooltip />
                    <Legend />
                    {series.fields.map((f) => (
                      <Line
                        key={String(f.key)}
                        type="monotone"
                        dataKey={f.key as string}
                        name={f.label}
                        stroke={f.color}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
