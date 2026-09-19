"use client";

import { useRef, useState } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function UploadDropzone({
  onFiles,
  disabled,
  maxSizeLabel,
}: {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
  maxSizeLabel: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleFiles(files: FileList | null) {
    const selected = files ? Array.from(files) : [];
    if (selected.length > 0 && !disabled) onFiles(selected);
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
        "flex min-h-[340px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center transition-[border-color,background-color] duration-150",
        dragging ? "border-blue bg-blue-soft/60" : "border-border bg-card hover:border-muted-foreground-soft",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <div className={cn("mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-card transition-transform duration-150 motion-reduce:transition-none", dragging && "-translate-y-1 motion-reduce:transform-none")}>
        <FileText className="h-5 w-5 text-blue" strokeWidth={1.75} />
      </div>
      <div className="text-[15px] font-semibold text-foreground" aria-live="polite">
        {dragging ? "Release to process locally" : "Drop your medical records here"}
      </div>
      <div className="mt-1 text-sm text-muted-foreground">{dragging ? "Your file stays on this device" : "or click to browse files"}</div>
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
        Supported: PDF, TXT, CSV, JPG, PNG · Max {maxSizeLabel}
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.txt,.csv,.jpg,.jpeg,.png,application/pdf,text/plain,text/csv,image/jpeg,image/png"
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
