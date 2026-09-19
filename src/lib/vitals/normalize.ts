export type VitalField = "timestamp" | "systolic" | "diastolic" | "heartRate" | "glucose" | "spo2" | "weight";

// Tolerant header aliases per spec section 15.
const ALIASES: Record<VitalField, string[]> = {
  timestamp: ["timestamp", "date", "datetime", "time"],
  systolic: ["systolic", "sys", "sbp"],
  diastolic: ["diastolic", "dia", "dbp"],
  heartRate: ["heart_rate", "heartrate", "hr", "pulse"],
  glucose: ["glucose", "blood_glucose"],
  spo2: ["spo2", "oxygen_saturation"],
  weight: ["weight", "body_weight"],
};

export function guessFieldForHeader(header: string): VitalField | null {
  const normalized = header.trim().toLowerCase().replace(/\s+/g, "_");
  for (const [field, aliases] of Object.entries(ALIASES) as [VitalField, string[]][]) {
    if (aliases.includes(normalized)) return field;
  }
  return null;
}

export function autoMapHeaders(headers: string[]): Partial<Record<VitalField, string>> {
  const mapping: Partial<Record<VitalField, string>> = {};
  for (const header of headers) {
    const field = guessFieldForHeader(header);
    if (field && !mapping[field]) mapping[field] = header;
  }
  return mapping;
}

export function needsManualMapping(mapping: Partial<Record<VitalField, string>>): boolean {
  return !mapping.timestamp;
}
