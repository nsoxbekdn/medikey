import { describe, it, expect, vi, beforeEach } from "vitest";
import { detectPII } from "@/lib/pii/detectors";

// extractDocumentText dynamically imports these — mock both so this suite
// never touches real PDF.js/Tesseract (no canvas/worker in the test env).
vi.mock("./pdf", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./pdf")>();
  return {
    ...actual,
    extractPdfText: vi.fn(),
    extractPdfTextViaOcr: vi.fn(),
  };
});
vi.mock("./ocr", () => ({
  createOcrSession: vi.fn(),
  isOcrTextUsable: vi.fn(),
}));

const SYNTHETIC_SCAN_TEXT = `Patient Name: Rahul Sharma
DOB: 14/03/1984
Patient ID: SD-2026-48213
Phone: 9876543210
HbA1c: 7.4%
Hemoglobin: 13.8 g/dL`;

describe("extractDocumentText fallback routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("avoids OCR for a normal text PDF", async () => {
    const pdf = await import("./pdf");
    const ocr = await import("./ocr");
    vi.mocked(pdf.extractPdfText).mockResolvedValue({ text: "Meaningful clinical text. ".repeat(20), numPages: 1 });

    const { extractDocumentText } = await import("./text");
    const file = new File([new Uint8Array()], "report.pdf", { type: "application/pdf" });
    const text = await extractDocumentText(file);

    expect(text).toContain("Meaningful clinical text.");
    expect(ocr.createOcrSession).not.toHaveBeenCalled();
    expect(pdf.extractPdfTextViaOcr).not.toHaveBeenCalled();
  });

  it("falls back to OCR for a scanned PDF and feeds the recovered text through", async () => {
    const pdf = await import("./pdf");
    const ocr = await import("./ocr");
    vi.mocked(pdf.extractPdfText).mockResolvedValue({ text: "", numPages: 2 });
    vi.mocked(pdf.extractPdfTextViaOcr).mockResolvedValue(SYNTHETIC_SCAN_TEXT);
    const terminate = vi.fn().mockResolvedValue(undefined);
    vi.mocked(ocr.createOcrSession).mockResolvedValue({ recognize: vi.fn(), terminate });
    vi.mocked(ocr.isOcrTextUsable).mockReturnValue(true);

    const { extractDocumentText } = await import("./text");
    const file = new File([new Uint8Array()], "scan.pdf", { type: "application/pdf" });
    const text = await extractDocumentText(file);

    expect(text).toBe(SYNTHETIC_SCAN_TEXT);
    expect(terminate).toHaveBeenCalled();

    // The recovered text is exactly what would be handed to the existing
    // Privacy X-Ray pipeline — verify it detects the synthetic PII fields.
    const types = new Set(detectPII(text).map((m) => m.type));
    expect(types).toContain("name");
    expect(types).toContain("phone");
    expect(types).toContain("patient_id");
  });

  it("routes JPG/PNG files through OCR", async () => {
    const ocr = await import("./ocr");
    const recognize = vi.fn().mockResolvedValue(SYNTHETIC_SCAN_TEXT);
    const terminate = vi.fn().mockResolvedValue(undefined);
    vi.mocked(ocr.createOcrSession).mockResolvedValue({ recognize, terminate });
    vi.mocked(ocr.isOcrTextUsable).mockReturnValue(true);

    const { extractDocumentText } = await import("./text");
    const file = new File([new Uint8Array()], "report.png", { type: "image/png" });
    const text = await extractDocumentText(file);

    expect(text).toBe(SYNTHETIC_SCAN_TEXT);
    expect(recognize).toHaveBeenCalledWith(file);
    expect(terminate).toHaveBeenCalled();
  });

  it("fails safely instead of continuing with unusable OCR output", async () => {
    const pdf = await import("./pdf");
    const ocr = await import("./ocr");
    vi.mocked(pdf.extractPdfText).mockResolvedValue({ text: "", numPages: 1 });
    vi.mocked(pdf.extractPdfTextViaOcr).mockResolvedValue("....;;;");
    const terminate = vi.fn().mockResolvedValue(undefined);
    vi.mocked(ocr.createOcrSession).mockResolvedValue({ recognize: vi.fn(), terminate });
    vi.mocked(ocr.isOcrTextUsable).mockReturnValue(false);

    const { extractDocumentText } = await import("./text");
    const file = new File([new Uint8Array()], "unreadable.pdf", { type: "application/pdf" });

    await expect(extractDocumentText(file)).rejects.toThrow(/couldn't reliably extract/);
    expect(terminate).toHaveBeenCalled();
  });
});
