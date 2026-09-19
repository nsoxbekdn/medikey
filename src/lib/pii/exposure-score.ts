import { PIIMatch } from "@/lib/db/types";

// Heuristic privacy exposure indicator — not a formal anonymity guarantee.
const WEIGHTS: Record<string, number> = {
  name: 18,
  aadhaar: 20,
  phone: 15,
  email: 12,
  patient_id: 14,
  mrn: 14,
  uhid: 14,
  registration_no: 8,
  dob: 10,
  date: 4,
  address: 16,
};

export function exposureScore(matches: PIIMatch[], onlySelected = false): number {
  const relevant = matches.filter((m) => (onlySelected ? m.selected : true));
  if (relevant.length === 0) return 0;
  const raw = relevant.reduce((sum, m) => sum + (WEIGHTS[m.type] ?? 6), 0);
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function exposureAfterSanitization(matches: PIIMatch[]): number {
  const remaining = matches.filter((m) => !m.selected);
  return exposureScore(remaining);
}

export function severityBucket(matches: PIIMatch[]): { high: PIIMatch[]; medium: PIIMatch[]; low: PIIMatch[] } {
  return {
    high: matches.filter((m) => m.confidence === "high"),
    medium: matches.filter((m) => m.confidence === "medium"),
    low: matches.filter((m) => m.confidence === "low"),
  };
}
