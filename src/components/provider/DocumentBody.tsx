import { useMemo } from "react";
import { parseDocumentBlocks } from "@/lib/provider/formatDocument";

// Presentation only: turns decrypted plaintext into a readable clinical
// surface. Never alters, infers, or omits content — only detects structure
// already present in the text. Falls back to prose for anything it can't
// confidently parse.
export function DocumentBody({ text }: { text: string }) {
  const blocks = useMemo(() => parseDocumentBlocks(text), [text]);

  return (
    <div className="space-y-4">
      {blocks.map((block, i) => {
        if (block.type === "heading") {
          return (
            <h3
              key={i}
              className={`text-base font-semibold text-primary ${i > 0 ? "mt-6 border-t border-border pt-4" : ""}`}
            >
              {block.text}
            </h3>
          );
        }
        if (block.type === "table") {
          return (
            <dl key={i} className="divide-y divide-border-subtle">
              {block.rows.map((row, j) => (
                <div key={j} className="grid grid-cols-[minmax(120px,180px)_1fr] gap-4 py-1.5 text-sm">
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="break-words text-foreground">{row.value}</dd>
                </div>
              ))}
            </dl>
          );
        }
        return (
          <p key={i} className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
            {block.lines.join("\n")}
          </p>
        );
      })}
    </div>
  );
}
