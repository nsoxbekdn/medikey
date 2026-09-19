"use client";

import { format } from "date-fns";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { VitalsPoint } from "@/lib/db/types";
import { downsampleForChart } from "@/lib/vitals/downsample";

const MAX_CHART_POINTS = 300;
const RECENT_READING_COUNT = 8;
const BLOOD_PRESSURE_FIELDS = ["systolic", "diastolic"] as const;

const SECONDARY_METRICS = [
  { key: "heartRate", label: "Heart rate", unit: "bpm" },
  { key: "glucose", label: "Glucose", unit: "mg/dL" },
  { key: "spo2", label: "SpO₂", unit: "%" },
  { key: "weight", label: "Weight", unit: "kg" },
] as const;

function readableDate(timestamp: string, includeTime = false) {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "Unknown date" : format(date, includeTime ? "d MMM yyyy, HH:mm" : "d MMM yyyy");
}

export function ProviderVitalsSection({ points }: { points: VitalsPoint[] }) {
  const ordered = [...points].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const bpReadings = ordered.filter((point) => typeof point.systolic === "number" || typeof point.diastolic === "number");
  const latestBp = bpReadings.at(-1);
  const chartData = downsampleForChart(bpReadings, [...BLOOD_PRESSURE_FIELDS], MAX_CHART_POINTS);

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-6" aria-labelledby="shared-vitals-title">
      <div>
        <h2 id="shared-vitals-title" className="text-lg font-semibold text-foreground">Shared vitals</h2>
        <p className="mt-1 text-sm text-muted-foreground">Only patient-selected vitals are shown.</p>
      </div>

      {latestBp && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/30 p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Latest blood pressure</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
              {latestBp.systolic ?? "—"} <span className="text-muted-foreground">/</span> {latestBp.diastolic ?? "—"}
              <span className="ml-2 text-base font-medium text-muted-foreground">mmHg</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
              <span>Last recorded {readableDate(latestBp.timestamp, true)}</span>
              <span>{bpReadings.length} reading{bpReadings.length === 1 ? "" : "s"}</span>
            </div>
          </div>

          <div className="rounded-lg border border-border p-4">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h3 className="text-sm font-semibold text-foreground">Blood pressure history</h3>
              <div className="flex gap-4 text-xs text-muted-foreground" aria-label="Chart legend">
                <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-primary" />Systolic</span>
                <span><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-success" />Diastolic</span>
              </div>
            </div>
            <div className="h-64 w-full" aria-label="Blood pressure chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis dataKey="timestamp" tickFormatter={(value) => readableDate(String(value))} tick={{ fontSize: 11 }} minTickGap={32} />
                  <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} unit="" width={36} />
                  <Tooltip labelFormatter={(value) => readableDate(String(value), true)} formatter={(value, name) => [`${value} mmHg`, name]} />
                  <Line type="monotone" dataKey="systolic" name="Systolic" stroke="var(--primary)" strokeWidth={2} dot={false} activeDot={{ r: 3 }} connectNulls isAnimationActive={false} />
                  <Line type="monotone" dataKey="diastolic" name="Diastolic" stroke="var(--success)" strokeWidth={2} dot={false} activeDot={{ r: 3 }} connectNulls isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-1 text-center text-xs text-muted-foreground">Blood pressure (mmHg)</p>
          </div>

          <div className="overflow-hidden rounded-lg border border-border">
            <div className="border-b border-border px-4 py-3"><h3 className="text-sm font-semibold text-foreground">Recent readings</h3></div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="px-4 py-2 font-medium">Date</th><th className="px-4 py-2 font-medium">Systolic</th><th className="px-4 py-2 font-medium">Diastolic</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {[...bpReadings].reverse().slice(0, RECENT_READING_COUNT).map((reading) => (
                    <tr key={`${reading.timestamp}-${reading.systolic}-${reading.diastolic}`}>
                      <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">{readableDate(reading.timestamp, true)}</td>
                      <td className="px-4 py-2.5 font-medium text-foreground">{reading.systolic ?? "—"}</td>
                      <td className="px-4 py-2.5 font-medium text-foreground">{reading.diastolic ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {SECONDARY_METRICS.map(({ key, label, unit }) => {
          const readings = ordered.filter((point) => typeof point[key] === "number");
          const latest = readings.at(-1);
          if (!latest) return null;
          return (
            <div key={key} className="rounded-lg border border-border p-4">
              <p className="text-xs font-medium text-muted-foreground">{label}</p>
              <p className="mt-1 text-xl font-semibold text-foreground">{latest[key]} <span className="text-sm font-normal text-muted-foreground">{unit}</span></p>
              <p className="mt-1 text-xs text-muted-foreground">{readings.length} reading{readings.length === 1 ? "" : "s"} · {readableDate(latest.timestamp)}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
