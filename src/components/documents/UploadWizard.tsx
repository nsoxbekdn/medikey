"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { UploadDropzone } from "@/components/upload/UploadDropzone";
import { Loader2 } from "lucide-react";
import { extractDocumentText, isSupportedFile, MAX_FILE_SIZE_BYTES, type ExtractStatus } from "@/lib/documents/text";
import { PrivacyXRay } from "@/components/privacy/PrivacyXRay";
import { PIIMatch } from "@/lib/db/types";
import { detectPII } from "@/lib/pii/detectors";
import { sanitizeText, verifyNoLeakage } from "@/lib/pii/sanitizer";
import { useVault } from "@/lib/vault/VaultProvider";
import { generateAesKey, aesEncryptBytes } from "@/lib/crypto/aes";
import { wrapKey } from "@/lib/crypto/key-wrap";
import { sha256Hex } from "@/lib/crypto/hash";
import { utf8ToBuf } from "@/lib/crypto/encoding";
import { createSupabaseBrowserClient } from "@/lib/db/client";
import { toast } from "sonner";

type Step = "select" | "processing" | "review" | "saving" | "done";

const STATUS_MESSAGES: Record<string, string> = {
  reading: "Reading locally...",
  extracting: "Extracting text...",
  scanning: "Scanning identifiers...",
  waiting: "Waiting for your review...",
  encrypting: "Encrypting in this browser...",
  uploading: "Uploading ciphertext...",
  saved: "Saved securely.",
};

// Maps wizard state onto the 4-step workflow stepper (Upload, Privacy X-Ray, Encrypt, Vault).
const STEP_INDEX: Record<Step, number> = { select: 0, processing: 0, review: 1, saving: 2, done: 3 };

export function UploadWizard({ onStepChange }: { onStepChange?: (index: number) => void }) {
  const router = useRouter();
  const { vault, unlocked } = useVault();
  const [step, setStep] = useState<Step>("select");
  const [statusMessage, setStatusMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState("");
  const [matches, setMatches] = useState<PIIMatch[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ocrActive, setOcrActive] = useState(false);

  useEffect(() => {
    onStepChange?.(STEP_INDEX[step]);
  }, [step, onStepChange]);

  async function onFileSelected(f: File) {
    setError(null);
    setOcrActive(false);
    if (!isSupportedFile(f)) {
      setError("Unsupported file type. Please upload a PDF, TXT, CSV, JPG, or PNG file.");
      return;
    }
    if (f.size > MAX_FILE_SIZE_BYTES) {
      setError("File too large. MediKey supports files up to 15MB in this demo.");
      return;
    }
    setFile(f);
    setStep("processing");
    setStatusMessage(STATUS_MESSAGES.reading);
    try {
      setStatusMessage(STATUS_MESSAGES.extracting);
      const text = await extractDocumentText(f, (status: ExtractStatus) => {
        switch (status.phase) {
          case "extracting-pdf":
            setStatusMessage(`Reading page ${status.page} of ${status.totalPages}`);
            break;
          case "scanned-detected":
            setOcrActive(true);
            setStatusMessage("Scanned document detected — extracting text privately on this device...");
            break;
          case "ocr-page":
            setOcrActive(true);
            setStatusMessage(`Extracting text privately — page ${status.page} of ${status.totalPages}`);
            break;
          case "ocr-image":
            setOcrActive(true);
            setStatusMessage("Extracting text privately on this device...");
            break;
        }
      });
      setExtractedText(text);
      setStatusMessage(STATUS_MESSAGES.scanning);
      const found = detectPII(text);
      setMatches(found);
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process file locally.");
      setStep("select");
    }
  }

  async function onConfirmSanitization(selected: PIIMatch[]) {
    if (!file || !vault) return;
    setStep("saving");
    setError(null);
    try {
      setStatusMessage(STATUS_MESSAGES.encrypting);

      const sanitized = sanitizeText(extractedText, selected);
      if (!verifyNoLeakage(sanitized, selected)) {
        throw new Error("Sanitization verification failed — selected identifiers still present. Aborting save.");
      }

      // Hashing, encryption and key wrapping are independent of each other and
      // of the signed-in user lookup below — run them concurrently.
      const [originalBuf, supabase] = [new Uint8Array(await file.arrayBuffer()), createSupabaseBrowserClient()];
      const documentKey = await generateAesKey();
      const [sha256, originalEncrypted, sanitizedEncrypted, wrappedKey, userRes] = await Promise.all([
        sha256Hex(originalBuf),
        aesEncryptBytes(documentKey, originalBuf),
        aesEncryptBytes(documentKey, utf8ToBuf(sanitized)),
        wrapKey(vault.rootKey, documentKey),
        supabase.auth.getUser(),
      ]);
      const user = userRes.data.user;
      if (!user) throw new Error("Not signed in.");

      setStatusMessage(STATUS_MESSAGES.uploading);
      const originalPath = `${user.id}/${uuidv4()}`;
      const sanitizedPath = `${user.id}/${uuidv4()}`;

      // Ciphertext bytes go straight to Storage — no base64 round trip.
      const [up1, up2] = await Promise.all([
        supabase.storage
          .from("encrypted-blobs")
          .upload(originalPath, originalEncrypted.ciphertext as BlobPart, { contentType: "application/octet-stream" }),
        supabase.storage
          .from("encrypted-blobs")
          .upload(sanitizedPath, sanitizedEncrypted.ciphertext as BlobPart, { contentType: "application/octet-stream" }),
      ]);
      if (up1.error) throw up1.error;
      if (up2.error) throw up2.error;

      // sanitizedSha256 doesn't depend on the uploads above — compute it
      // while those network calls were in flight isn't possible here since we
      // need it for the RPC below, but it's cheap (native SHA-256, ms-level).
      const sanitizedSha256 = await sha256Hex(utf8ToBuf(sanitized));

      // One RPC = one round trip, and documents/document_key_wrappers/
      // sanitized_artifacts are inserted atomically server-side instead of
      // three sequential client round trips.
      const { data: docRow, error: docErr } = (await supabase
        .rpc("save_document", {
          p_title_safe: file.name,
          p_mime_type: file.type || "application/octet-stream",
          p_encrypted_storage_path: originalPath,
          p_encryption_iv: originalEncrypted.iv,
          p_sha256_digest: sha256,
          p_byte_size: file.size,
          p_wrapped_document_key: wrappedKey.ciphertext,
          p_wrapping_iv: wrappedKey.iv,
          p_sanitized_storage_path: sanitizedPath,
          p_sanitized_encryption_iv: sanitizedEncrypted.iv,
          p_sanitized_sha256: sanitizedSha256,
        })
        .single()) as { data: { id: string } | null; error: { message: string } | null };
      if (docErr || !docRow) throw docErr ?? new Error("Failed to save document.");

      setStatusMessage(STATUS_MESSAGES.saved);
      setStep("done");
      toast.success("Record encrypted and saved to your vault.");
      router.push(`/vault/${docRow.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setStep("review");
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {step === "select" && (
        <UploadDropzone onFile={onFileSelected} disabled={!unlocked} maxSizeLabel="15 MB" />
      )}

      {(step === "processing" || step === "saving") && (
        <Card>
          <CardContent className="flex min-h-[340px] flex-col items-center justify-center gap-3 text-center">
            <Loader2 className="h-5 w-5 animate-spin text-blue" />
            <div className="text-sm font-medium text-foreground">{statusMessage}</div>
            <div className="text-xs text-muted-foreground">Processing happens in this browser.</div>
            {ocrActive && (
              <div className="text-xs text-muted-foreground-soft">
                OCR runs locally in your browser. The scanned document is not sent to an external OCR service.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === "review" && (
        <PrivacyXRay
          originalText={extractedText}
          matches={matches}
          onMatchesChange={setMatches}
          onConfirm={onConfirmSanitization}
        />
      )}
    </div>
  );
}
