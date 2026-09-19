import { VitalsPoint } from "@/lib/db/types";
import { VitalField } from "./normalize";

export interface VitalStats {
  latest: number | null;
  min: number | null;
  max: number | null;
  avg: number | null;
  count: number;
}

export function statsFor(points: VitalsPoint[], field: Exclude<VitalField, "timestamp">): VitalStats {
  const values = points
    .map((p) => p[field])
    .filter((v): v is number => typeof v === "number");
  if (values.length === 0) return { latest: null, min: null, max: null, avg: null, count: 0 };
  const latest = values[values.length - 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return { latest, min, max, avg: Math.round(avg * 10) / 10, count: values.length };
}

export function dateRange(points: VitalsPoint[]): { start: string; end: string } | null {
  if (points.length === 0) return null;
  return { start: points[0].timestamp, end: points[points.length - 1].timestamp };
}

export function filterByDateRange(points: VitalsPoint[], start?: string, end?: string): VitalsPoint[] {
  return points.filter((p) => {
    const t = new Date(p.timestamp).getTime();
    if (start && t < new Date(start).getTime()) return false;
    if (end && t > new Date(end).getTime()) return false;
    return true;
  });
}
