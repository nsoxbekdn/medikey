import Papa from "papaparse";
import { VitalsPoint } from "@/lib/db/types";
import { VitalField, autoMapHeaders } from "./normalize";

export interface ParsedVitalsCsv {
  headers: string[];
  rows: Record<string, string>[];
  mapping: Partial<Record<VitalField, string>>;
}

export function parseVitalsCsv(csvText: string): ParsedVitalsCsv {
  const result = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });
  const headers = result.meta.fields ?? [];
  return { headers, rows: result.data, mapping: autoMapHeaders(headers) };
}

const NUMERIC_FIELDS: Exclude<VitalField, "timestamp">[] = ["systolic", "diastolic", "heartRate", "glucose", "spo2", "weight"];

export function buildVitalsPoints(
  rows: Record<string, string>[],
  mapping: Partial<Record<VitalField, string>>
): VitalsPoint[] {
  // Parse each timestamp exactly once. Keeping the numeric epoch beside the
  // normalized point avoids constructing two Dates for every sort comparison.
  const points: Array<{ epoch: number; point: VitalsPoint }> = [];
  for (const row of rows) {
    const tsCol = mapping.timestamp;
    if (!tsCol) continue;
    const rawTs = row[tsCol];
    if (!rawTs) continue;
    const epoch = Date.parse(rawTs);
    if (Number.isNaN(epoch)) continue; // skip invalid rows gracefully

    const point: VitalsPoint = { timestamp: new Date(epoch).toISOString() };
    for (const field of NUMERIC_FIELDS) {
      const col = mapping[field];
      if (!col) continue;
      const raw = row[col];
      if (raw === undefined || raw === "") continue;
      const num = Number(raw);
      if (!Number.isNaN(num)) point[field] = num;
    }
    points.push({ epoch, point });
  }
  points.sort((a, b) => a.epoch - b.epoch);
  return points.map(({ point }) => point);
}
