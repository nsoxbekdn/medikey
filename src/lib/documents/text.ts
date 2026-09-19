export async function extractPlainText(file: File): Promise<string> {
  return file.text();
}

export type ExtractStatus =
  | { phase: "extracting-pdf"; page: number; totalPages: number }
  | { phase: "scanned-detected" }
  | { phase: "ocr-page"; page: number; totalPages: number }
  | { phase: "ocr-image" };

const UNREADABLE_MESSAGE = "We couldn't reliably extract text from this file. Try again or choose another file.";

export async function extractDocumentText(
  file: File,
  onStatus?: (status: ExtractStatus) => void,
  options?: {
    ocrSession?: import("./ocr").OcrSession;
    getOcrSession?: () => Promise<import("./ocr").OcrSession>;
  },
): Promise<string> {
  const name = file.name.toLowerCase();

  if (file.type === "application/pdf" || name.endsWith(".pdf")) {
    const { extractPdfText, extractPdfTextViaOcr, isLikelyScannedPdf } = await import("./pdf");
    const { text, numPages } = await extractPdfText(file, (page, totalPages) =>
      onStatus?.({ phase: "extracting-pdf", page, totalPages }),
    );
    if (!isLikelyScannedPdf(text, numPages)) return text;

    onStatus?.({ phase: "scanned-detected" });
    const { createOcrSession, isOcrTextUsable } = await import("./ocr");
    const sharedSession = options?.ocrSession ?? await options?.getOcrSession?.();
    const session = sharedSession ?? await createOcrSession();
    const ownsSession = !sharedSession;
    let ocrText: string;
    try {
      ocrText = await extractPdfTextViaOcr(file, session, (page, totalPages) =>
        onStatus?.({ phase: "ocr-page", page, totalPages }),
      );
    } finally {
      if (ownsSession) await session.terminate();
    }
    if (!isOcrTextUsable(ocrText)) throw new Error(UNREADABLE_MESSAGE);
    return ocrText;
  }

  if (SUPPORTED_IMAGE_TYPES.includes(file.type) || /\.(jpe?g|png)$/i.test(name)) {
    onStatus?.({ phase: "ocr-image" });
    const { createOcrSession, isOcrTextUsable } = await import("./ocr");
    const sharedSession = options?.ocrSession ?? await options?.getOcrSession?.();
    const session = sharedSession ?? await createOcrSession();
    const ownsSession = !sharedSession;
    let ocrText: string;
    try {
      ocrText = await session.recognize(file);
    } finally {
      if (ownsSession) await session.terminate();
    }
    if (!isOcrTextUsable(ocrText)) throw new Error(UNREADABLE_MESSAGE);
    return ocrText;
  }

  return extractPlainText(file);
}

export const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png"];
export const SUPPORTED_MIME_TYPES = ["application/pdf", "text/plain", "text/csv", ...SUPPORTED_IMAGE_TYPES];

export function isSupportedFile(file: File): boolean {
  return (
    SUPPORTED_MIME_TYPES.includes(file.type) ||
    /\.(pdf|txt|csv|jpe?g|png)$/i.test(file.name)
  );
}

export const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB hackathon limit
