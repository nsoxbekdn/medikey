"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { VitalsPoint } from "@/lib/db/types";
import { downsampleForChart } from "@/lib/vitals/downsample";

export function DashboardBloodPressureChart({ points }: { points: VitalsPoint[] }) {
  const readings = points.filter((point) => typeof point.systolic === "number" && typeof point.diastolic === "number");
  const latest = readings.at(-1);
  const chartData = downsampleForChart(readings, ["systolic", "diastolic"], 60).map((point) => ({ ...point, label: new Date(point.timestamp).toLocaleDateString(undefined, { month: "short", year: "2-digit" }) }));

  if (!latest) return <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">No blood pressure readings in this dataset.</div>;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-[28px] font-semibold tracking-[-0.02em] text-primary">{latest.systolic} / {latest.diastolic}<span className="ml-1 text-sm font-medium">mmHg</span></p><p className="mt-1 text-xs text-muted-foreground">Latest reading · {new Date(latest.timestamp).toLocaleDateString()}</p></div>
      </div>
      <div className="mt-5 h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="var(--border-subtle)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} domain={["dataMin - 10", "dataMax + 10"]} />
            <Tooltip />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            <Line type="monotone" dataKey="systolic" name="Systolic" stroke="var(--chart-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="diastolic" name="Diastolic" stroke="var(--chart-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
