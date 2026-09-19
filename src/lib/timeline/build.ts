import { DocumentRow, VitalsPoint } from "@/lib/db/types";
import { TimelineEvent, MetricTrend } from "./types";

export const TIMELINE_METRICS: Array<{ key: Exclude<keyof VitalsPoint, "timestamp">; label: string; unit: string }> = [
  { key: "systolic", label: "Systolic BP", unit: "mmHg" },
  { key: "diastolic", label: "Diastolic BP", unit: "mmHg" },
  { key: "heartRate", label: "Heart rate", unit: "bpm" },
  { key: "glucose", label: "Glucose", unit: "mg/dL" },
  { key: "spo2", label: "SpO2", unit: "%" },
  { key: "weight", label: "Weight", unit: "kg" },
];

interface VitalsSource {
  datasetId: string;
  datasetName: string;
  points: VitalsPoint[];
}

// Deterministic only: every event traces to a real document row or a real
// decrypted vitals reading. Never invents a fact. One event per metric per
// calendar year uses that year's latest reading, keeping the timeline
// readable across a long history instead of one event per raw sample.
export function buildTimelineEvents(documents: DocumentRow[], vitalsSources: VitalsSource[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const doc of documents) {
    events.push({
      id: `doc-${doc.id}`,
      date: doc.created_at,
      type: "document",
      title: "Report uploaded",
      value: doc.title_safe,
      sourceId: doc.id,
      sourceLabel: doc.title_safe,
      confidence: "confirmed",
    });
  }

  for (const source of vitalsSources) {
    for (const metric of TIMELINE_METRICS) {
      const latestByYear = new Map<number, { timestamp: string; value: number }>();
      for (const point of source.points) {
        const raw = point[metric.key];
        if (typeof raw !== "number") continue;
        const year = new Date(point.timestamp).getFullYear();
        const existing = latestByYear.get(year);
        if (!existing || new Date(point.timestamp).getTime() > new Date(existing.timestamp).getTime()) {
          latestByYear.set(year, { timestamp: point.timestamp, value: raw });
        }
      }
      for (const [, reading] of latestByYear) {
        events.push({
          id: `vital-${source.datasetId}-${metric.key}-${reading.timestamp}`,
          date: reading.timestamp,
          type: "vital",
          title: metric.label,
          value: String(reading.value),
          unit: metric.unit,
          sourceId: source.datasetId,
          sourceLabel: source.datasetName,
          confidence: "confirmed",
        });
      }
    }
  }

  return events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

// Per-metric progression across the full history (not just what's shown on
// the timeline), for the deterministic "what changed" comparison.
export function buildMetricTrends(vitalsSources: VitalsSource[]): MetricTrend[] {
  const trends: MetricTrend[] = [];
  for (const metric of TIMELINE_METRICS) {
    const values: Array<{ date: string; value: number }> = [];
    for (const source of vitalsSources) {
      for (const point of source.points) {
        const raw = point[metric.key];
        if (typeof raw === "number") values.push({ date: point.timestamp, value: raw });
      }
    }
    if (values.length < 2) continue;
    values.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    trends.push({ metric: metric.key, label: metric.label, unit: metric.unit, values });
  }
  return trends;
}

export function groupEventsByYear(events: TimelineEvent[]): Array<[number, TimelineEvent[]]> {
  const byYear = new Map<number, TimelineEvent[]>();
  for (const event of events) {
    const year = new Date(event.date).getFullYear();
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year)!.push(event);
  }
  return Array.from(byYear.entries()).sort((a, b) => a[0] - b[0]);
}
