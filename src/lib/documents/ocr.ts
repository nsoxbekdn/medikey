// Client-only: local OCR via Tesseract.js. Worker, core (wasm) and English
// trained data are served from /public/tesseract so no request ever leaves
// this origin — no CDN, no cloud OCR service. One worker is created per
// document and reused across pages, never one worker per page.

const MIN_MEANINGFUL_CHARS = 20;
const MIN_ALPHANUMERIC_RATIO = 0.3;

// Conservative sanity check: OCR "succeeded" technically but produced noise
// (blank page, unreadable scan). Caller should treat this as a failure
// rather than pushing garbage into the Privacy X-Ray pipeline.
export function isOcrTextUsable(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < MIN_MEANINGFUL_CHARS) return false;
  const alphanumeric = (trimmed.match(/[a-zA-Z0-9]/g) ?? []).length;
  return alphanumeric / trimmed.length >= MIN_ALPHANUMERIC_RATIO;
}

export interface OcrSession {
  recognize(image: Blob | HTMLCanvasElement): Promise<string>;
  terminate(): Promise<void>;
}

export async function createOcrSession(): Promise<OcrSession> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", undefined, {
    workerPath: "/tesseract/worker.min.js",
    corePath: "/tesseract/core",
    langPath: "/tesseract/lang",
  });
  return {
    async recognize(image) {
      const { data } = await worker.recognize(image);
      return data.text;
    },
    terminate: async () => {
      await worker.terminate();
    },
  };
}
