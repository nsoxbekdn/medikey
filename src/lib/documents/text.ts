export async function extractPlainText(file: File): Promise<string> {
  return file.text();
}

export async function extractDocumentText(file: File): Promise<string> {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const { extractPdfText } = await import("./pdf");
    return extractPdfText(file);
  }
  return extractPlainText(file);
}

export const SUPPORTED_MIME_TYPES = ["application/pdf", "text/plain", "text/csv"];

export function isSupportedFile(file: File): boolean {
  return (
    SUPPORTED_MIME_TYPES.includes(file.type) ||
    /\.(pdf|txt|csv)$/i.test(file.name)
  );
}

export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB hackathon limit
