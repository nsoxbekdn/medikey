// Conservative, non-AI presentation parser for decrypted clinical documents.
// Never modifies content, never infers missing values — only detects
// label/value pairs and short heading lines so plaintext reads as a report
// instead of one preformatted block. Anything unrecognized falls back to
// prose, unchanged.

export type DocumentBlock =
  | { type: "prose"; lines: string[] }
  | { type: "heading"; text: string }
  | { type: "table"; rows: { label: string; value: string }[] };

const LABEL_COLON = /^([A-Za-z][A-Za-z0-9 /.'()-]{1,40}?):\s+(\S.*)$/;
const LABEL_SPACED = /^(\S.{0,38}?)\s{2,}(\S.+)$/;
const DIVIDER = /^[-_=]{3,}$/;

function matchLabelValue(line: string): { label: string; value: string } | null {
  const colon = line.match(LABEL_COLON);
  if (colon) return { label: colon[1].trim(), value: colon[2].trim() };
  const spaced = line.match(LABEL_SPACED);
  if (spaced && spaced[1].trim().length <= 40) return { label: spaced[1].trim(), value: spaced[2].trim() };
  return null;
}

function looksLikeHeading(line: string, prevBlank: boolean, nextIsLabelValue: boolean): boolean {
  if (!prevBlank) return false;
  if (line.length > 50) return false;
  if (matchLabelValue(line)) return false;
  const words = line.trim().split(/\s+/);
  if (words.length > 6) return false;
  if (/[.:;,]$/.test(line.trim())) return false;
  return nextIsLabelValue || /^[A-Z][A-Za-z ]*$/.test(line.trim());
}

export function parseDocumentBlocks(text: string): DocumentBlock[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: DocumentBlock[] = [];
  let i = 0;
  let prevBlank = true;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "" || DIVIDER.test(line.trim())) {
      prevBlank = true;
      i++;
      continue;
    }

    const nextLine = lines[i + 1] ?? "";
    const nextIsLabelValue = matchLabelValue(nextLine) !== null;

    if (looksLikeHeading(line, prevBlank, nextIsLabelValue)) {
      blocks.push({ type: "heading", text: line.trim() });
      prevBlank = false;
      i++;
      continue;
    }

    const lv = matchLabelValue(line);
    if (lv) {
      const rows = [lv];
      i++;
      while (i < lines.length) {
        const next = matchLabelValue(lines[i]);
        if (!next) break;
        rows.push(next);
        i++;
      }
      blocks.push({ type: "table", rows });
      prevBlank = false;
      continue;
    }

    const proseLines = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== "" && !matchLabelValue(lines[i]) && !DIVIDER.test(lines[i].trim())) {
      proseLines.push(lines[i]);
      i++;
    }
    blocks.push({ type: "prose", lines: proseLines });
    prevBlank = false;
  }

  return blocks;
}
