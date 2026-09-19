"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { UploadDropzone } from "@/components/upload/UploadDropzone";
import { Loader2 } from "lucide-react";
import { extractDocumentText, isSupportedFile, MAX_FILE_SIZE_BYTES } from "@/lib/documents/text";
import { PrivacyXRay } from "@/components/privacy/PrivacyXRay";
import { PIIMatch } from "@/lib/db/types";
import { detectPII } from "@/lib/pii/detectors";
import { sanitizeText, verifyNoLeakage } from "@/lib/pii/sanitizer";
import { useVault } from "@/lib/vault/VaultProvider";
import { generateAesKey, aesEncrypt } from "@/lib/crypto/aes";
import { wrapKey } from "@/lib/crypto/key-wrap";
import { sha256Hex } from "@/lib/crypto/hash";
import { base64ToBuf, utf8ToBuf } from "@/lib/crypto/encoding";
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

  useEffect(() => {
    onStepChange?.(STEP_INDEX[step]);
  }, [step, onStepChange]);

  async function onFileSelected(f: File) {
    setError(null);
    if (!isSupportedFile(f)) {
      setError("Unsupported file type. Please upload a PDF, TXT, or CSV file.");
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
      const text = await extractDocumentText(f);
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

      const originalBuf = new Uint8Array(await file.arrayBuffer());
      const sha256 = await sha256Hex(originalBuf);

      const documentKey = await generateAesKey();
      const originalEncrypted = await aesEncrypt(documentKey, originalBuf);
      const sanitizedEncrypted = await aesEncrypt(documentKey, utf8ToBuf(sanitized));
      const wrappedKey = await wrapKey(vault.rootKey, documentKey);

      setStatusMessage(STATUS_MESSAGES.uploading);
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");

      const originalPath = `${user.id}/${uuidv4()}`;
      const sanitizedPath = `${user.id}/${uuidv4()}`;

      const { error: upErr1 } = await supabase.storage
        .from("encrypted-blobs")
        .upload(originalPath, base64ToBuf(originalEncrypted.ciphertext) as BlobPart, {
          contentType: "application/octet-stream",
        });
      if (upErr1) throw upErr1;

      const { error: upErr2 } = await supabase.storage
        .from("encrypted-blobs")
        .upload(sanitizedPath, base64ToBuf(sanitizedEncrypted.ciphertext) as BlobPart, {
          contentType: "application/octet-stream",
        });
      if (upErr2) throw upErr2;

      const { data: docRow, error: docErr } = await supabase
        .from("documents")
        .insert({
          owner_id: user.id,
          title_safe: file.name,
          mime_type: file.type || "application/octet-stream",
          encrypted_storage_path: originalPath,
          encryption_iv: originalEncrypted.iv,
          sha256_digest: sha256,
          byte_size: file.size,
          privacy_scan_completed: true,
        })
        .select()
        .single();
      if (docErr || !docRow) throw docErr ?? new Error("Failed to save document.");

      const { error: wrapErr } = await supabase.from("document_key_wrappers").insert({
        document_id: docRow.id,
        owner_id: user.id,
        wrapped_document_key: wrappedKey.ciphertext,
        wrapping_iv: wrappedKey.iv,
        wrapping_algorithm: "AES-GCM-256",
      });
      if (wrapErr) throw wrapErr;

      const sanitizedSha256 = await sha256Hex(utf8ToBuf(sanitized));
      const { error: sanErr } = await supabase.from("sanitized_artifacts").insert({
        document_id: docRow.id,
        owner_id: user.id,
        encrypted_storage_path: sanitizedPath,
        encryption_iv: sanitizedEncrypted.iv,
        sha256_digest: sanitizedSha256,
      });
      if (sanErr) throw sanErr;

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
