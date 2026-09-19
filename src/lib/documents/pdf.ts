import { mapWithConcurrency } from "@/lib/async/concurrency";
import type { OcrSession } from "./ocr";

const PDF_PAGE_CONCURRENCY = 6;
const OCR_RENDER_SCALE = 1.75;

// A PDF whose extracted text averages below this many letters/digits per
// page almost certainly has no real text layer — it's a scan. Judged over
// the whole document, not a single short page.
const MIN_ALPHANUMERIC_CHARS_PER_PAGE = 30;

async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  return pdfjs;
}

export interface PdfTextResult {
  text: string;
  numPages: number;
}

// Client-only: extracts text from a PDF entirely in the browser via PDF.js.
// Pages are bounded rather than all queued at once, preserving interactivity
// and limiting memory while still removing the sequential 120-page waterfall.
export async function extractPdfText(
  file: File,
  onProgress?: (page: number, totalPages: number) => void,
): Promise<PdfTextResult> {
  const pdfjs = await loadPdfJs();

  const buf = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: buf });
  const doc = await loadingTask.promise;
  let completed = 0;
  try {
    const pageNumbers = Array.from({ length: doc.numPages }, (_, index) => index + 1);
    const pages = await mapWithConcurrency(pageNumbers, PDF_PAGE_CONCURRENCY, async (pageNumber) => {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const strings = content.items.map((item) => ("str" in item ? item.str : ""));
      completed += 1;
      onProgress?.(completed, doc.numPages);
      return strings.join(" ");
    });
    return { text: pages.join("\n").trim(), numPages: doc.numPages };
  } finally {
    await loadingTask.destroy();
  }
}

export function isLikelyScannedPdf(text: string, numPages: number): boolean {
  const alphanumeric = (text.match(/[a-zA-Z0-9]/g) ?? []).length;
  return alphanumeric / Math.max(numPages, 1) < MIN_ALPHANUMERIC_CHARS_PER_PAGE;
}

// OCR fallback for scanned/image-only PDFs. Renders one page to a canvas at
// a time, feeds it to the shared OCR session, then drops the canvas before
// moving on — never holds more than one rendered page in memory.
export async function extractPdfTextViaOcr(
  file: File,
  session: OcrSession,
  onProgress?: (page: number, totalPages: number) => void,
): Promise<string> {
  const pdfjs = await loadPdfJs();
  const buf = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: buf });
  const doc = await loadingTask.promise;
  try {
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: OCR_RENDER_SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas rendering is unavailable in this browser.");
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      pages.push(await session.recognize(canvas));
      canvas.width = 0;
      canvas.height = 0; // release the backing bitmap before the next page
      onProgress?.(pageNumber, doc.numPages);
    }
    return pages.join("\n").trim();
  } finally {
    await loadingTask.destroy();
  }
}
