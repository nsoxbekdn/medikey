import { VitalsPoint } from "@/lib/db/types";

export const SHAREABLE_VITAL_METRICS = ["systolic", "diastolic", "heartRate", "glucose", "spo2", "weight"] as const;
export type ShareableVitalsMetric = (typeof SHAREABLE_VITAL_METRICS)[number];

// Create a new payload containing time plus only explicitly selected numeric
// fields. The provider never downloads the source dataset.
export function selectVitalsMetrics(points: VitalsPoint[], metrics: ShareableVitalsMetric[]): VitalsPoint[] {
  return points.map((point) => {
    const selected: VitalsPoint = { timestamp: point.timestamp };
    for (const metric of metrics) {
      const value = point[metric];
      if (typeof value === "number") selected[metric] = value;
    }
    return selected;
  });
}
