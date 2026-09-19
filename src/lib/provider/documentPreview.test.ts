import { describe, expect, it } from "vitest";
import { getDocumentPreviewKind } from "./documentPreview";

describe("provider document preview routing", () => {
  it("routes original PDFs to the binary PDF preview", () => {
    expect(getDocumentPreviewKind("document", "application/pdf")).toBe("pdf");
    expect(getDocumentPreviewKind("document", "Application/PDF; charset=binary")).toBe("pdf");
  });

  it("routes textual documents and sanitized artifacts to DocumentBody", () => {
    expect(getDocumentPreviewKind("document", "text/plain; charset=utf-8")).toBe("text");
    expect(getDocumentPreviewKind("document", "text/csv")).toBe("text");
    expect(getDocumentPreviewKind("sanitized_document", undefined)).toBe("text");
  });

  it("does not text-decode unsupported binary documents", () => {
    expect(getDocumentPreviewKind("document", "application/octet-stream")).toBe("unsupported");
    expect(getDocumentPreviewKind("document", undefined)).toBe("unsupported");
  });
});
