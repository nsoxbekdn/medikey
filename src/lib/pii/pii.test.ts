import { describe, it, expect } from "vitest";
import { detectPII } from "./detectors";
import { sanitizeText, verifyNoLeakage } from "./sanitizer";
import { exposureScore, exposureAfterSanitization } from "./exposure-score";

// Spec §67 Test E — exact input/output.
const INPUT = `Patient: Rahul Sharma
Phone: 9876543210
HbA1c: 7.4%`;

describe("Privacy engine (Test E)", () => {
  it("detects name and phone, leaves clinical values", () => {
    const matches = detectPII(INPUT);
    const types = matches.map((m) => m.type).sort();
    expect(types).toContain("name");
    expect(types).toContain("phone");
    expect(matches.some((m) => m.value.includes("7.4"))).toBe(false);
  });

  it("produces the exact sanitized derivative with no leaked strings", () => {
    const matches = detectPII(INPUT);
    const sanitized = sanitizeText(INPUT, matches);
    expect(sanitized).toBe(`Patient: [REDACTED]
Phone: [REDACTED]
HbA1c: 7.4%`);
    expect(sanitized).not.toContain("Rahul");
    expect(sanitized).not.toContain("9876543210");
    expect(verifyNoLeakage(sanitized, matches)).toBe(true);
  });

  it("respects user overrides (unselected items stay)", () => {
    const matches = detectPII(INPUT).map((m) => (m.type === "phone" ? { ...m, selected: false } : m));
    const sanitized = sanitizeText(INPUT, matches);
    expect(sanitized).toContain("9876543210");
    expect(sanitized).not.toContain("Rahul");
  });

  it("detects email, Aadhaar-like, date and labelled IDs", () => {
    const text = "Email: a.b@example.com\nAadhaar: 4821 9932 1187\nDOB: 14/03/1984\nMRN: MR-1234\nUHID: UH88";
    const types = new Set(detectPII(text).map((m) => m.type));
    for (const t of ["email", "aadhaar", "mrn", "uhid"]) expect(types.has(t)).toBe(true);
    expect(types.has("date") || types.has("dob")).toBe(true);
  });

  it("exposure indicator drops to 0 after full sanitization", () => {
    const matches = detectPII(INPUT);
    expect(exposureScore(matches)).toBeGreaterThan(0);
    expect(exposureAfterSanitization(matches)).toBe(0);
  });
});
