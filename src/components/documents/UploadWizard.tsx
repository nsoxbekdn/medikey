"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UploadDropzone } from "@/components/upload/UploadDropzone";
import { PrivacyXRay } from "@/components/privacy/PrivacyXRay";
import { Check, Circle, FileText, Loader2, RotateCcw, XCircle } from "lucide-react";
import { extractDocumentText, isSupportedFile, MAX_FILE_SIZE_BYTES, type ExtractStatus } from "@/lib/documents/text";
import type { OcrSession } from "@/lib/documents/ocr";
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
type QueueStatus = "queued" | "preprocessing" | "ready" | "reviewing" | "encrypting" | "saved" | "failed";
type Prepared = { kind: "document"; text: string; matches: PIIMatch[] } | { kind: "vitals"; points: VitalsPoint[] };
type QueueItem = { id: string; file: File; status: QueueStatus; prepared?: Prepared; detail?: string; error?: string };

const LOOKAHEAD = 2;
const STATUS_LABEL: Record<QueueStatus, string> = {
  queued: "Queued", preprocessing: "Processing locally…", ready: "Ready for review", reviewing: "Reviewing",
  encrypting: "Encrypting", saved: "Encrypted / saved", failed: "Failed",
};
const STEP_INDEX: Record<Step, number> = { select: 0, processing: 0, review: 1, saving: 2, done: 3 };

function yieldToUi() {
  return new Promise<void>((resolve) => window.setTimeout(resolve, 0));
}

export function UploadWizard({ onStepChange }: { onStepChange?: (index: number) => void }) {
  const router = useRouter();
  const { vault, unlocked } = useVault();
  const [step, setStep] = useState<Step>("select");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const queueRef = useRef<QueueItem[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const currentIdRef = useRef<string | null>(null);
  const pumpingRef = useRef(false);
  const ocrSessionRef = useRef<Promise<OcrSession> | null>(null);
  const batchStartedAt = useRef(0);
  const [error, setError] = useState<string | null>(null);

  const current = queue.find((item) => item.id === currentId) ?? null;
  const currentPosition = current ? queue.findIndex((item) => item.id === current.id) + 1 : 0;

  useEffect(() => onStepChange?.(STEP_INDEX[step]), [step, onStepChange]);
  useEffect(() => () => { void ocrSessionRef.current?.then((session) => session.terminate()); }, []);

  function replaceQueue(items: QueueItem[]) { queueRef.current = items; setQueue(items); }
  function updateItem(id: string, patch: Partial<QueueItem>) {
    replaceQueue(queueRef.current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }
  function setCurrent(id: string | null) { currentIdRef.current = id; setCurrentId(id); }
  async function getOcrSession() {
    if (!ocrSessionRef.current) {
      ocrSessionRef.current = import("@/lib/documents/ocr").then(({ createOcrSession }) => createOcrSession());
    }
    return ocrSessionRef.current;
  }

  async function preprocess(item: QueueItem): Promise<Prepared> {
    if (/\.csv$/i.test(item.file.name) || item.file.type === "text/csv") {
      const parsed = parseVitalsCsv(await item.file.text());
      if (parsed.rows.length === 0) throw new Error("No rows found in this CSV.");
      if (needsManualMapping(parsed.mapping)) throw new Error("CSV needs manual timestamp mapping. Import it from Vitals.");
      const points = buildVitalsPoints(parsed.rows, parsed.mapping);
      if (points.length === 0) throw new Error("No valid rows after mapping — check date formats.");
      return { kind: "vitals", points };
    }

    const text = await extractDocumentText(item.file, (status: ExtractStatus) => {
      if (status.phase === "extracting-pdf") updateItem(item.id, { detail: `PDF.js — page ${status.page} of ${status.totalPages}` });
      if (status.phase === "scanned-detected") updateItem(item.id, { detail: "Scanned PDF detected — starting local OCR" });
      if (status.phase === "ocr-page") updateItem(item.id, { detail: `OCR — page ${status.page} of ${status.totalPages}` });
      if (status.phase === "ocr-image") updateItem(item.id, { detail: "OCR — processing image locally" });
    }, { getOcrSession });
    return { kind: "document", text, matches: detectPII(text) };
  }

  function showNextReady() {
    if (currentIdRef.current) return true;
    const next = queueRef.current.find((item) => item.status === "ready");
    if (!next) return false;
    updateItem(next.id, { status: "reviewing" });
    setCurrent(next.id);
    setStep("review");
    if (process.env.NODE_ENV !== "production") {
      // Development timing instrumentation; deliberately sampled at the event boundary.
      // eslint-disable-next-line react-hooks/purity
      console.debug(`[multi-upload] ${next.file.name} review ready in ${Math.round(performance.now() - batchStartedAt.current)}ms`);
    }
    return true;
  }

  async function pumpPreprocessing() {
    if (pumpingRef.current) return;
    pumpingRef.current = true;
    try {
      while (true) {
        const items = queueRef.current;
        const activeIndex = currentIdRef.current ? items.findIndex((item) => item.id === currentIdRef.current) : -1;
        const firstPending = items.findIndex((item) => ["queued", "preprocessing", "ready"].includes(item.status));
        const anchor = activeIndex >= 0 ? activeIndex : Math.max(0, firstPending);
        const nextIndex = items.findIndex((item, index) => index >= anchor && index <= anchor + LOOKAHEAD && item.status === "queued");
        if (nextIndex < 0) break;
        const item = items[nextIndex];
        updateItem(item.id, { status: "preprocessing", detail: "Preparing locally…", error: undefined });
        await yieldToUi();
        try {
          const prepared = await preprocess(item);
          updateItem(item.id, { status: "ready", prepared, detail: undefined });
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : "Local preprocessing failed.";
          updateItem(item.id, { status: "failed", error: message, detail: undefined });
        }
        showNextReady();
        await yieldToUi();
      }
    } finally {
      pumpingRef.current = false;
      if (!showNextReady() && !currentIdRef.current) {
        const unfinished = queueRef.current.some((item) => ["queued", "preprocessing", "ready"].includes(item.status));
        if (!unfinished) { setStep("done"); router.refresh(); }
      }
    }
  }

  function onFilesSelected(files: File[]) {
    // Development timing instrumentation; this handler never runs during render.
    // eslint-disable-next-line react-hooks/purity
    batchStartedAt.current = performance.now();
    const additions = files.map((file): QueueItem => {
      if (!isSupportedFile(file)) return { id: uuidv4(), file, status: "failed", error: "Unsupported file type." };
      if (file.size > MAX_FILE_SIZE_BYTES) return { id: uuidv4(), file, status: "failed", error: "File exceeds 15 MB." };
      return { id: uuidv4(), file, status: "queued" };
    });
    replaceQueue([...queueRef.current, ...additions]);
    setStep("processing");
    void pumpPreprocessing();
  }

  async function saveVitals(item: QueueItem, points: VitalsPoint[]) {
    if (!vault) throw new Error("Vault is locked.");
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
      owner_id: user.id, name: item.file.name.replace(/\.csv$/i, ""), source_type: "csv", encrypted_payload_path: path,
      encryption_iv: encrypted.iv, wrapped_dataset_key: wrapped.ciphertext, wrapping_iv: wrapped.iv, schema_version: 1,
      start_at: points[0].timestamp, end_at: points.at(-1)!.timestamp,
    });
    if (insertError) throw insertError;
  }

  async function saveDocument(item: QueueItem, prepared: Extract<Prepared, { kind: "document" }>, selected: PIIMatch[]) {
    if (!vault) throw new Error("Vault is locked.");
    const sanitized = sanitizeText(prepared.text, selected);
    if (!verifyNoLeakage(sanitized, selected)) throw new Error("Sanitization verification failed. Save aborted.");
    const originalBuf = new Uint8Array(await item.file.arrayBuffer());
    const documentKey = await generateAesKey();
    const supabase = createSupabaseBrowserClient();
    const [sha256, originalEncrypted, sanitizedEncrypted, wrappedKey, userRes, sanitizedSha256] = await Promise.all([
      sha256Hex(originalBuf), aesEncryptBytes(documentKey, originalBuf), aesEncryptBytes(documentKey, utf8ToBuf(sanitized)),
      wrapKey(vault.rootKey, documentKey), supabase.auth.getUser(), sha256Hex(utf8ToBuf(sanitized)),
    ]);
    const user = userRes.data.user;
    if (!user) throw new Error("Not signed in.");
    const originalPath = `${user.id}/${uuidv4()}`;
    const sanitizedPath = `${user.id}/${uuidv4()}`;
    const [up1, up2] = await Promise.all([
      supabase.storage.from("encrypted-blobs").upload(originalPath, originalEncrypted.ciphertext as BlobPart, { contentType: "application/octet-stream" }),
      supabase.storage.from("encrypted-blobs").upload(sanitizedPath, sanitizedEncrypted.ciphertext as BlobPart, { contentType: "application/octet-stream" }),
    ]);
    if (up1.error) throw up1.error;
    if (up2.error) throw up2.error;
    const { error: saveError } = await supabase.rpc("save_document", {
      p_title_safe: item.file.name, p_mime_type: item.file.type || "application/octet-stream", p_encrypted_storage_path: originalPath,
      p_encryption_iv: originalEncrypted.iv, p_sha256_digest: sha256, p_byte_size: item.file.size,
      p_wrapped_document_key: wrappedKey.ciphertext, p_wrapping_iv: wrappedKey.iv, p_sanitized_storage_path: sanitizedPath,
      p_sanitized_encryption_iv: sanitizedEncrypted.iv, p_sanitized_sha256: sanitizedSha256,
    });
    if (saveError) throw saveError;
  }

  async function confirmCurrent(selected?: PIIMatch[]) {
    const item = queueRef.current.find((entry) => entry.id === currentIdRef.current);
    if (!item?.prepared) return;
    updateItem(item.id, { status: "encrypting" }); setStep("saving"); setError(null);
    try {
      if (item.prepared.kind === "vitals") await saveVitals(item, item.prepared.points);
      else await saveDocument(item, item.prepared, selected ?? item.prepared.matches);
      updateItem(item.id, { status: "saved", prepared: undefined });
      toast.success(`${item.file.name} encrypted and saved.`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Upload failed.";
      updateItem(item.id, { status: "failed", error: message, prepared: undefined }); setError(`${item.file.name}: ${message}`);
    }
    setCurrent(null);
    if (!showNextReady()) setStep("processing");
    void pumpPreprocessing();
  }

  function retry(item: QueueItem) {
    updateItem(item.id, { status: "queued", error: undefined, detail: undefined, prepared: undefined });
    if (!currentIdRef.current) setStep("processing");
    void pumpPreprocessing();
  }

  const currentDocument = current?.prepared?.kind === "document" ? current.prepared : null;
  const currentVitals = current?.prepared?.kind === "vitals" ? current.prepared : null;

  return (
    <div className="space-y-6">
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {queue.length === 0 && <UploadDropzone onFiles={onFilesSelected} disabled={!unlocked} maxSizeLabel="15 MB each" />}
      {queue.length > 0 && <Card><CardContent className="space-y-3 pt-6">
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-foreground">Upload queue</h2><p className="text-xs text-muted-foreground">Privacy review stays manual; preparation runs up to two files ahead.</p></div>{currentPosition > 0 && <span className="text-sm font-medium text-foreground">Reviewing {currentPosition} of {queue.length}</span>}</div>
        <ul className="divide-y divide-border rounded-lg border border-border">{queue.map((item) => <li key={item.id} className="flex items-center gap-3 px-3 py-2.5">
          {item.status === "preprocessing" || item.status === "encrypting" ? <Loader2 className="h-4 w-4 animate-spin text-blue" /> : item.status === "saved" ? <Check className="h-4 w-4 text-success" /> : item.status === "failed" ? <XCircle className="h-4 w-4 text-destructive" /> : ["ready", "reviewing"].includes(item.status) ? <FileText className="h-4 w-4 text-blue" /> : <Circle className="h-4 w-4 text-muted-foreground-soft" />}
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-foreground">{item.file.name}</p>{(item.detail || item.error) && <p className={`truncate text-xs ${item.error ? "text-destructive" : "text-muted-foreground"}`}>{item.error ?? item.detail}</p>}</div>
          {item.status === "failed" && <button type="button" onClick={() => retry(item)} className="inline-flex items-center gap-1 text-xs font-medium text-blue"><RotateCcw className="h-3 w-3" />Retry</button>}
          <span className="shrink-0 text-xs text-muted-foreground">{STATUS_LABEL[item.status]}</span>
        </li>)}</ul>
      </CardContent></Card>}
      {step === "processing" && <Card><CardContent className="flex min-h-[180px] flex-col items-center justify-center gap-3 text-center"><Loader2 className="h-5 w-5 animate-spin text-blue" /><p className="text-sm font-medium text-foreground">Preparing the next record locally…</p><p className="text-xs text-muted-foreground">Privacy review will open as soon as it is ready.</p></CardContent></Card>}
      {step === "saving" && <Card><CardContent className="flex min-h-[180px] flex-col items-center justify-center gap-3 text-center"><Loader2 className="h-5 w-5 animate-spin text-blue" /><p className="text-sm font-medium text-foreground">Encrypting and saving…</p></CardContent></Card>}
      {step === "review" && current && currentDocument && <PrivacyXRay originalText={currentDocument.text} matches={currentDocument.matches} onMatchesChange={(matches) => updateItem(current.id, { prepared: { kind: "document", text: currentDocument.text, matches } })} onConfirm={(selected) => void confirmCurrent(selected)} />}
      {step === "review" && currentVitals && <Card><CardHeader><CardTitle>Vitals ready to import</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-3 sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Readings</p><p className="text-lg font-semibold">{currentVitals.points.length}</p></div><div><p className="text-xs text-muted-foreground">From</p><p className="text-sm font-medium">{new Date(currentVitals.points[0].timestamp).toLocaleDateString()}</p></div><div><p className="text-xs text-muted-foreground">To</p><p className="text-sm font-medium">{new Date(currentVitals.points.at(-1)!.timestamp).toLocaleDateString()}</p></div></div><Button onClick={() => void confirmCurrent()}>Encrypt &amp; save vitals</Button></CardContent></Card>}
      {step === "done" && <div className="flex justify-end"><Button variant="outline" onClick={() => { replaceQueue([]); setCurrent(null); setStep("select"); setError(null); }}>Upload more files</Button></div>}
    </div>
  );
}
