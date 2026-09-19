export interface SanitizedChunk {
  sourceId: string;
  page?: number;
  text: string;
}

const CHUNK_SIZE = 800;

// Chunks already-sanitized text only. Never call this on raw extracted text.
export function chunkSanitizedText(sourceId: string, sanitizedText: string): SanitizedChunk[] {
  const chunks: SanitizedChunk[] = [];
  for (let i = 0; i < sanitizedText.length; i += CHUNK_SIZE) {
    chunks.push({ sourceId, text: sanitizedText.slice(i, i + CHUNK_SIZE) });
  }
  return chunks;
}

// Naive keyword-overlap retrieval — good enough for a hackathon demo corpus.
export function retrieveTopChunks(chunks: SanitizedChunk[], question: string, topK = 3): SanitizedChunk[] {
  const terms = question.toLowerCase().split(/\W+/).filter(Boolean);
  const scored = chunks.map((c) => {
    const lower = c.text.toLowerCase();
    const score = terms.reduce((sum, t) => sum + (lower.includes(t) ? 1 : 0), 0);
    return { chunk: c, score };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.chunk);
}
