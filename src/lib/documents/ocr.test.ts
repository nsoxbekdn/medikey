import { describe, it, expect } from "vitest";
import { isLikelyScannedPdf } from "./pdf";
import { isOcrTextUsable } from "./ocr";

describe("scanned-PDF detection heuristic", () => {
  it("treats a normal text PDF as not scanned", () => {
    const text = "Patient Name: Rahul Sharma\n".repeat(20); // plenty of real text, 1 page
    expect(isLikelyScannedPdf(text, 1)).toBe(false);
  });

  it("treats a PDF with near-empty extracted text as scanned", () => {
    expect(isLikelyScannedPdf("  \n\n ", 3)).toBe(true);
  });

  it("judges the whole document, not one short page", () => {
    // A short first page is fine as long as the document overall has content.
    const text = "Page one.\n" + "Meaningful clinical content on page two. ".repeat(30);
    expect(isLikelyScannedPdf(text, 2)).toBe(false);
  });
});

describe("OCR output quality gate", () => {
  it("accepts text with real content", () => {
    expect(isOcrTextUsable("Patient Name: Rahul Sharma\nHbA1c: 7.4%\nHemoglobin: 13.8 g/dL")).toBe(true);
  });

  it("rejects near-empty output", () => {
    expect(isOcrTextUsable("   ")).toBe(false);
  });

  it("rejects noise with too low an alphanumeric ratio", () => {
    expect(isOcrTextUsable("....;;;///---:::   ,,,...")).toBe(false);
  });
});
