"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { UploadDropzone } from "@/components/upload/UploadDropzone";
import { PrivacyXRay } from "@/components/privacy/PrivacyXRay";
import { Check, Circle, FileText, Loader2, XCircle } from "lucide-react";
import { extractDocumentText, isSupportedFile, MAX_FILE_SIZE_BYTES, type ExtractStatus } from "@/lib/documents/text";
import { PIIMatch, VitalsPoint } from "@/lib/db/types";
import { detectPII } from "@/lib/pii/detectors";
import { sanitizeText, verifyNoLeakage } from "@/lib/pii/sanitizer";
import { useVault } from "@/lib/vault/VaultProvider";
import { generateAesKey, aesEncryptBytes } from "@/lib/crypto/aes";
import { wrapKey } from "@/lib/crypto/key-wrap";
import { sha256Hex } from "@/lib/crypto/hash";
import { utf8ToBuf } from "@/lib/crypto/encoding";
import { createSupabaseBrowserClient } from "@/lib/db/client";
import { buildVitalsPoints, parseVitalsCsv } from "@/lib/vitals/parse";
import { needsManualMapping } from "@/lib/vitals/normalize";
import { toast } from "sonner";

type Step = "select" | "processing" | "review" | "saving" | "done";
type QueueStatus = "queued" | "processing" | "review" | "saved" | "failed";
type QueueItem = { id: string; file: File; status: QueueStatus; error?: string };

const STATUS_LABEL: Record<QueueStatus, string> = {
  queued: "Queued", processing: "Processing", review: "Privacy review / ready",
  saved: "Encrypted / saved", failed: "Failed",
};
const STEP_INDEX: Record<Step, number> = { select: 0, processing: 0, review: 1, saving: 2, done: 3 };

export function UploadWizard({ onStepChange }: { onStepChange?: (index: number) => void }) {
  const router = useRouter();
  const { vault, unlocked } = useVault();
  const [step, setStep] = useState<Step>("select");
  const [statusMessage, setStatusMessage] = useState("");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const queueRef = useRef<QueueItem[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState("");
  const [matches, setMatches] = useState<PIIMatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ocrActive, setOcrActive] = useState(false);
  const current = queue.find((item) => item.id === currentId) ?? null;
  const currentPosition = current ? queue.findIndex((item) => item.id === current.id) + 1 : 0;

  useEffect(() => onStepChange?.(STEP_INDEX[step]), [step, onStepChange]);

  function replaceQueue(items: QueueItem[]) { queueRef.current = items; setQueue(items); }
  function updateItem(id: string, patch: Partial<QueueItem>) {
    replaceQueue(queueRef.current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  async function saveVitals(file: File) {
    if (!vault) throw new Error("Vault is locked.");
    const parsed = parseVitalsCsv(await file.text());
    if (parsed.rows.length === 0) throw new Error("No rows found in this CSV.");
    if (needsManualMapping(parsed.mapping)) throw new Error("CSV needs manual timestamp mapping. Import it from Vitals.");
    const points: VitalsPoint[] = buildVitalsPoints(parsed.rows, parsed.mapping);
    if (points.length === 0) throw new Error("No valid rows after mapping — check date formats.");
    const datasetKey = await generateAesKey();
    const supabase = createSupabaseBrowserClient();
    const [encrypted, wrapped, sessionRes] = await Promise.all([
      aesEncryptBytes(datasetKey, utf8ToBuf(JSON.stringify(points))), wrapKey(vault.rootKey, datasetKey), supabase.auth.getSession(),
    ]);
    const user = sessionRes.data.session?.user;
    if (!user) throw new Error("Not signed in.");
    const path = `${user.id}/${uuidv4()}`;
    const { error: uploadError } = await supabase.storage.from("encrypted-blobs").upload(path, encrypted.ciphertext as BlobPart, { contentType: "application/octet-stream" });
    if (uploadError) throw uploadError;
    const { error: insertError } = await supabase.from("vitals_datasets").insert({
      owner_id: user.id, name: file.name.replace(/\.csv$/i, ""), source_type: "csv", encrypted_payload_path: path,
      encryption_iv: encrypted.iv, wrapped_dataset_key: wrapped.ciphertext, wrapping_iv: wrapped.iv, schema_version: 1,
      start_at: points[0].timestamp, end_at: points.at(-1)!.timestamp,
    });
    if (insertError) throw insertError;
  }

  async function processNext() {
    const next = queueRef.current.find((item) => item.status === "queued");
    if (!next) { setCurrentId(null); setStep("done"); setStatusMessage("Batch complete."); router.refresh(); return; }
    setCurrentId(next.id);
    updateItem(next.id, { status: "processing", error: undefined });
    setStep("processing"); setError(null); setOcrActive(false); setStatusMessage("Reading locally...");
    try {
      if (/\.csv$/i.test(next.file.name) || next.file.type === "text/csv") {
        setStatusMessage("Parsing and encrypting vitals locally...");
        await saveVitals(next.file);
        updateItem(next.id, { status: "saved" });
        toast.success(`${next.file.name} encrypted and saved.`);
        await processNext();
        return;
      }
      const text = await extractDocumentText(next.file, (status: ExtractStatus) => {
        switch (status.phase) {
          case "extracting-pdf": setStatusMessage(`Reading page ${status.page} of ${status.totalPages}`); break;
          case "scanned-detected": setOcrActive(true); setStatusMessage("Scanned document detected — running local OCR..."); break;
          case "ocr-page": setOcrActive(true); setStatusMessage(`Local OCR — page ${status.page} of ${status.totalPages}`); break;
          case "ocr-image": setOcrActive(true); setStatusMessage("Running local OCR..."); break;
        }
      });
      setExtractedText(text); setMatches(detectPII(text)); updateItem(next.id, { status: "review" }); setStep("review");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Failed to process file locally.";
      updateItem(next.id, { status: "failed", error: message }); setError(`${next.file.name}: ${message}`); await processNext();
    }
  }

  function onFilesSelected(files: File[]) {
    const additions = files.map((file): QueueItem => {
      if (!isSupportedFile(file)) return { id: uuidv4(), file, status: "failed", error: "Unsupported file type." };
      if (file.size > MAX_FILE_SIZE_BYTES) return { id: uuidv4(), file, status: "failed", error: "File exceeds 15 MB." };
      return { id: uuidv4(), file, status: "queued" };
    });
    const combined = [...queueRef.current, ...additions];
    replaceQueue(combined);
    if (!currentId && !combined.some((item) => item.status === "processing" || item.status === "review")) void processNext();
  }

  async function onConfirmSanitization(selected: PIIMatch[]) {
    if (!current || !vault) return;
    setStep("saving"); updateItem(current.id, { status: "processing" }); setError(null);
    try {
      setStatusMessage("Encrypting in this browser...");
      const sanitized = sanitizeText(extractedText, selected);
      if (!verifyNoLeakage(sanitized, selected)) throw new Error("Sanitization verification failed. Save aborted.");
      const originalBuf = new Uint8Array(await current.file.arrayBuffer());
      const documentKey = await generateAesKey();
      const supabase = createSupabaseBrowserClient();
      const [sha256, originalEncrypted, sanitizedEncrypted, wrappedKey, userRes, sanitizedSha256] = await Promise.all([
        sha256Hex(originalBuf), aesEncryptBytes(documentKey, originalBuf), aesEncryptBytes(documentKey, utf8ToBuf(sanitized)),
        wrapKey(vault.rootKey, documentKey), supabase.auth.getUser(), sha256Hex(utf8ToBuf(sanitized)),
      ]);
      const user = userRes.data.user;
      if (!user) throw new Error("Not signed in.");
      setStatusMessage("Uploading ciphertext...");
      const originalPath = `${user.id}/${uuidv4()}`;
      const sanitizedPath = `${user.id}/${uuidv4()}`;
      const [up1, up2] = await Promise.all([
        supabase.storage.from("encrypted-blobs").upload(originalPath, originalEncrypted.ciphertext as BlobPart, { contentType: "application/octet-stream" }),
        supabase.storage.from("encrypted-blobs").upload(sanitizedPath, sanitizedEncrypted.ciphertext as BlobPart, { contentType: "application/octet-stream" }),
      ]);
      if (up1.error) throw up1.error;
      if (up2.error) throw up2.error;
      const { error: saveError } = await supabase.rpc("save_document", {
        p_title_safe: current.file.name, p_mime_type: current.file.type || "application/octet-stream", p_encrypted_storage_path: originalPath,
        p_encryption_iv: originalEncrypted.iv, p_sha256_digest: sha256, p_byte_size: current.file.size,
        p_wrapped_document_key: wrappedKey.ciphertext, p_wrapping_iv: wrappedKey.iv, p_sanitized_storage_path: sanitizedPath,
        p_sanitized_encryption_iv: sanitizedEncrypted.iv, p_sanitized_sha256: sanitizedSha256,
      });
      if (saveError) throw saveError;
      updateItem(current.id, { status: "saved" }); toast.success(`${current.file.name} encrypted and saved.`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Upload failed.";
      updateItem(current.id, { status: "failed", error: message }); setError(`${current.file.name}: ${message}`);
    }
    setExtractedText(""); setMatches([]); await processNext();
  }

  return (
    <div className="space-y-6">
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {queue.length === 0 && <UploadDropzone onFiles={onFilesSelected} disabled={!unlocked} maxSizeLabel="15 MB each" />}
      {queue.length > 0 && (
        <Card><CardContent className="space-y-3 pt-6">
          <div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-foreground">Upload queue</h2><p className="text-xs text-muted-foreground">Files are processed one at a time.</p></div>{currentPosition > 0 && step !== "done" && <span className="text-sm font-medium text-foreground">Processing {currentPosition} of {queue.length}</span>}</div>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {queue.map((item) => <li key={item.id} className="flex items-center gap-3 px-3 py-2.5">
              {item.status === "processing" ? <Loader2 className="h-4 w-4 animate-spin text-blue" /> : item.status === "saved" ? <Check className="h-4 w-4 text-success" /> : item.status === "failed" ? <XCircle className="h-4 w-4 text-destructive" /> : item.status === "review" ? <FileText className="h-4 w-4 text-blue" /> : <Circle className="h-4 w-4 text-muted-foreground-soft" />}
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-foreground">{item.file.name}</p>{item.error && <p className="truncate text-xs text-destructive">{item.error}</p>}</div><span className="shrink-0 text-xs text-muted-foreground">{STATUS_LABEL[item.status]}</span>
            </li>)}
          </ul>
        </CardContent></Card>
      )}
      {(step === "processing" || step === "saving") && <Card><CardContent className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-center"><Loader2 className="h-5 w-5 animate-spin text-blue" /><div className="text-sm font-medium text-foreground">{statusMessage}</div><div className="text-xs text-muted-foreground">Processing happens in this browser.</div>{ocrActive && <div className="text-xs text-muted-foreground-soft">OCR runs locally. No document is sent to an external OCR service.</div>}</CardContent></Card>}
      {step === "review" && <PrivacyXRay originalText={extractedText} matches={matches} onMatchesChange={setMatches} onConfirm={onConfirmSanitization} />}
      {step === "done" && <div className="flex justify-end"><button type="button" onClick={() => { replaceQueue([]); setStep("select"); setError(null); }} className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted">Upload more files</button></div>}
    </div>
  );
}
