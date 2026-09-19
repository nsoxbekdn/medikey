import { mapWithConcurrency } from "@/lib/async/concurrency";

const PDF_PAGE_CONCURRENCY = 6;

// Client-only: extracts text from a PDF entirely in the browser via PDF.js.
// Pages are bounded rather than all queued at once, preserving interactivity
// and limiting memory while still removing the sequential 120-page waterfall.
export async function extractPdfText(
  file: File,
  onProgress?: (page: number, totalPages: number) => void,
): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

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
    return pages.join("\n").trim();
  } finally {
    await loadingTask.destroy();
  }
}
