"use client";

import { useEffect, useRef } from "react";
import { ExternalLink, FileQuestion } from "lucide-react";
import { DocumentBody } from "./DocumentBody";
import type { DocumentPreviewKind } from "@/lib/provider/documentPreview";

interface ProviderDocumentPreviewProps {
  previewKind: DocumentPreviewKind;
  title: string;
  text?: string;
  binary?: ArrayBuffer;
}

function PdfPreview({ bytes, title }: { bytes: ArrayBuffer; title: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const openLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    const frame = frameRef.current;
    const openLink = openLinkRef.current;
    if (frame) frame.src = url;
    if (openLink) openLink.href = url;

    return () => {
      if (frame) frame.removeAttribute("src");
      if (openLink) openLink.removeAttribute("href");
      URL.revokeObjectURL(url);
    };
  }, [bytes]);

  return (
    <div className="space-y-3">
      <iframe
        ref={frameRef}
        title={`${title} PDF preview`}
        className="h-[70vh] min-h-[560px] w-full rounded-lg border border-border bg-white"
      />
      <a
        ref={openLinkRef}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
      >
        Open PDF in a new tab
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      </a>
    </div>
  );
}

export function ProviderDocumentPreview({ previewKind, title, text, binary }: ProviderDocumentPreviewProps) {
  if (previewKind === "text" && text !== undefined) {
    return <DocumentBody text={text} />;
  }

  if (previewKind === "pdf" && binary) {
    return <PdfPreview bytes={binary} title={title} />;
  }

  return (
    <div className="flex min-h-40 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center">
      <div className="max-w-sm space-y-2">
        <FileQuestion className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">Preview unavailable</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          This file type cannot be previewed safely in the provider portal.
        </p>
      </div>
    </div>
  );
}
