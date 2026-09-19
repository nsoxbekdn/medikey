"use client";

import { useRef, useState } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function UploadDropzone({
  onFile,
  disabled,
  maxSizeLabel,
}: {
  onFile: (file: File) => void;
  disabled?: boolean;
  maxSizeLabel: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleFiles(files: FileList | null) {
    const f = files?.[0];
    if (f && !disabled) onFile(f);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => !disabled && inputRef.current?.click()}
      className={cn(
        "flex min-h-[340px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center transition-colors duration-150",
        dragging ? "border-blue bg-blue-soft/60" : "border-border bg-[#fafbfd] hover:border-muted-foreground-soft",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-card">
        <FileText className="h-5 w-5 text-blue" strokeWidth={1.75} />
      </div>
      <div className="text-[15px] font-semibold text-foreground">Drop your medical record here</div>
      <div className="mt-1 text-sm text-muted-foreground">or click to browse files</div>
      <Button
        type="button"
        className="mt-5"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          inputRef.current?.click();
        }}
      >
        Choose files
      </Button>
      <div className="mt-5 text-xs text-muted-foreground-soft">
        Supported: PDF, TXT, CSV · Max {maxSizeLabel}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.txt,.csv,application/pdf,text/plain,text/csv"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
