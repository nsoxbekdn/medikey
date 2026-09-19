export type DocumentPreviewKind = "text" | "pdf" | "unsupported";

export function getDocumentPreviewKind(
  itemKind: "document" | "sanitized_document",
  mimeType: unknown,
): DocumentPreviewKind {
  // Sanitized artifacts are deliberately stored as UTF-8 text derivatives,
  // regardless of the original document's MIME type.
  if (itemKind === "sanitized_document") return "text";

  if (typeof mimeType !== "string") return "unsupported";
  const normalized = mimeType.split(";", 1)[0].trim().toLowerCase();

  if (normalized === "application/pdf") return "pdf";
  if (normalized.startsWith("text/")) return "text";
  return "unsupported";
}
