import { PIIMatch } from "@/lib/db/types";

// Produces a sanitized derivative: PII replaced by [REDACTED]. This is the
// shareable artifact — not a cosmetic overlay. Removed strings must not
// appear in the output (verified by the caller / tests).
export function sanitizeText(text: string, matches: PIIMatch[]): string {
  const selected = matches.filter((m) => m.selected).sort((a, b) => a.start - b.start);
  let result = "";
  let cursor = 0;
  for (const m of selected) {
    if (m.start < cursor) continue; // overlapping/out-of-order guard
    result += text.slice(cursor, m.start);
    result += "[REDACTED]";
    cursor = m.end;
  }
  result += text.slice(cursor);
  return result;
}

export function verifyNoLeakage(sanitized: string, matches: PIIMatch[]): boolean {
  return matches
    .filter((m) => m.selected)
    .every((m) => m.value.length === 0 || !sanitized.includes(m.value));
}
