import { PIIMatch } from "@/lib/db/types";

interface Rule {
  type: string;
  label: string;
  confidence: PIIMatch["confidence"];
  regex: RegExp;
}

// Deterministic regex + label-context rules. Not perfect PII detection —
// surfaced to the user as a heuristic, with manual override.
const RULES: Rule[] = [
  {
    type: "email",
    label: "Email address",
    confidence: "high",
    regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  },
  {
    type: "phone",
    label: "Mobile number",
    confidence: "high",
    regex: /(?:\+91[-\s]?)?[6-9]\d{9}\b/g,
  },
  {
    type: "aadhaar",
    label: "Aadhaar-like number",
    confidence: "high",
    regex: /\b\d{4}\s?\d{4}\s?\d{4}\b/g,
  },
  {
    type: "date",
    label: "Date",
    confidence: "medium",
    regex: /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g,
  },
];

// Scan lines that follow a recognizable label, e.g. "Patient Name: Rahul Sharma"
const LABEL_RULES: Array<{ type: string; label: string; confidence: PIIMatch["confidence"]; labels: string[] }> = [
  { type: "name", label: "Patient name", confidence: "high", labels: ["Patient Name", "Patient", "Name"] },
  { type: "patient_id", label: "Patient ID", confidence: "high", labels: ["Patient ID"] },
  { type: "mrn", label: "MRN", confidence: "high", labels: ["MRN"] },
  { type: "uhid", label: "UHID", confidence: "high", labels: ["UHID"] },
  { type: "registration_no", label: "Registration number", confidence: "medium", labels: ["Registration No", "Registration Number"] },
  { type: "phone", label: "Phone", confidence: "high", labels: ["Phone", "Mobile"] },
  { type: "email", label: "Email", confidence: "high", labels: ["Email"] },
  { type: "dob", label: "Date of birth", confidence: "medium", labels: ["DOB"] },
  { type: "address", label: "Address", confidence: "medium", labels: ["Address"] },
];

let counter = 0;
function nextId() {
  counter += 1;
  return `pii_${Date.now()}_${counter}`;
}

export function detectPII(text: string): PIIMatch[] {
  const matches: PIIMatch[] = [];

  for (const rule of RULES) {
    rule.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.regex.exec(text)) !== null) {
      matches.push({
        id: nextId(),
        type: rule.type,
        label: rule.label,
        value: m[0],
        start: m.index,
        end: m.index + m[0].length,
        confidence: rule.confidence,
        selected: true,
      });
    }
  }

  for (const rule of LABEL_RULES) {
    for (const label of rule.labels) {
      const labelRegex = new RegExp(`${label}\\s*[:\\-]\\s*([^\\n\\r]{1,80})`, "gi");
      let m: RegExpExecArray | null;
      while ((m = labelRegex.exec(text)) !== null) {
        const value = m[1].trim();
        if (!value) continue;
        const valueStart = m.index + m[0].indexOf(m[1]);
        matches.push({
          id: nextId(),
          type: rule.type,
          label: rule.label,
          value,
          start: valueStart,
          end: valueStart + value.length,
          confidence: rule.confidence,
          selected: true,
        });
      }
    }
  }

  return dedupeOverlaps(matches).sort((a, b) => a.start - b.start);
}

// If regex + label rules both hit the same span, keep the higher-confidence one.
function dedupeOverlaps(matches: PIIMatch[]): PIIMatch[] {
  const rank = { high: 3, medium: 2, low: 1 } as const;
  const sorted = [...matches].sort((a, b) => a.start - b.start || rank[b.confidence] - rank[a.confidence]);
  const kept: PIIMatch[] = [];
  for (const m of sorted) {
    const overlaps = kept.find((k) => m.start < k.end && m.end > k.start);
    if (!overlaps) kept.push(m);
  }
  return kept;
}
