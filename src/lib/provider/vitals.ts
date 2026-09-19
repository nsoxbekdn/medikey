import { VitalsPoint } from "@/lib/db/types";
import { buildVitalsPoints, parseVitalsCsv } from "@/lib/vitals/parse";

const METRIC_FIELDS = ["systolic", "diastolic", "heartRate", "glucose", "spo2", "weight"] as const;

function sanitizeJsonPoints(value: unknown): VitalsPoint[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const raw = entry as Record<string, unknown>;
    if (typeof raw.timestamp !== "string" || Number.isNaN(Date.parse(raw.timestamp))) return [];

    const point: VitalsPoint = { timestamp: new Date(raw.timestamp).toISOString() };
    for (const field of METRIC_FIELDS) {
      if (typeof raw[field] === "number" && Number.isFinite(raw[field])) point[field] = raw[field];
    }
    return [point];
  }).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

/** Parses an already-decrypted payload without fetching or reconstructing omitted metrics. */
export function parseProviderVitalsPayload(payload: string): VitalsPoint[] {
  try {
    const points = sanitizeJsonPoints(JSON.parse(payload));
    if (points.length > 0) return points;
  } catch {
    // Older shares may contain the original CSV representation.
  }

  const parsed = parseVitalsCsv(payload);
  return buildVitalsPoints(parsed.rows, parsed.mapping);
}

