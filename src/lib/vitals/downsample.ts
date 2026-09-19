import { VitalsPoint } from "@/lib/db/types";

// Display-only downsampling: bucket points and average each requested field per
// bucket, so multi-field series (e.g. systolic+diastolic) stay aligned on one
// timestamp per bucket. Never mutates or replaces the stored/shared dataset —
// callers must keep using the full `points` array for stats and sharing.
export function downsampleForChart(
  points: VitalsPoint[],
  fields: Array<Exclude<keyof VitalsPoint, "timestamp">>,
  targetPoints = 500,
): VitalsPoint[] {
  if (points.length <= targetPoints) return points;

  const bucketSize = points.length / targetPoints;
  const out: VitalsPoint[] = [];
  for (let b = 0; b < targetPoints; b++) {
    const start = Math.floor(b * bucketSize);
    const end = Math.min(Math.floor((b + 1) * bucketSize), points.length);
    if (start >= end) continue;

    const sums: Record<string, number> = {};
    const counts: Record<string, number> = {};
    for (const f of fields) {
      sums[f] = 0;
      counts[f] = 0;
    }
    for (let i = start; i < end; i++) {
      for (const f of fields) {
        const v = points[i][f];
        if (typeof v === "number") {
          sums[f] += v;
          counts[f]++;
        }
      }
    }

    const midIndex = Math.floor((start + end - 1) / 2);
    const bucket: VitalsPoint = { timestamp: points[midIndex].timestamp };
    for (const f of fields) {
      if (counts[f] > 0) (bucket as unknown as Record<string, number>)[f] = Math.round((sums[f] / counts[f]) * 100) / 100;
    }
    out.push(bucket);
  }
  return out;
}
