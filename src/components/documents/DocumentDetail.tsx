"use client";

import { useState } from "react";
import { DocumentRow, DocumentKeyWrapperRow, SanitizedArtifactRow } from "@/lib/db/types";
import { useVault } from "@/lib/vault/VaultProvider";
import { unwrapKey } from "@/lib/crypto/key-wrap";
import { aesDecryptBytes } from "@/lib/crypto/aes";
import { sha256Hex } from "@/lib/crypto/hash";
import { bufToUtf8 } from "@/lib/crypto/encoding";
import { createSupabaseBrowserClient } from "@/lib/db/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldCheck, ShieldAlert } from "lucide-react";

interface Props {
  document: DocumentRow;
  wrapper: DocumentKeyWrapperRow;
  sanitized: SanitizedArtifactRow | null;
}

export function DocumentDetail({ document, wrapper, sanitized }: Props) {
  const { vault } = useVault();
  const [decryptedText, setDecryptedText] = useState<string | null>(null);
  const [integrityOk, setIntegrityOk] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onDecrypt(useSanitized: boolean) {
    if (!vault) return;
    setBusy(true);
    setError(null);
    try {
      const target = useSanitized && sanitized ? sanitized : document;
      const iv = useSanitized && sanitized ? sanitized.encryption_iv : document.encryption_iv;
      const path = useSanitized && sanitized ? sanitized.encrypted_storage_path : document.encrypted_storage_path;

      const supabase = createSupabaseBrowserClient();
      // Key unwrap (CPU) and blob download (network) are independent.
      const [documentKey, downloadRes] = await Promise.all([
        unwrapKey(vault.rootKey, { ciphertext: wrapper.wrapped_document_key, iv: wrapper.wrapping_iv }),
        supabase.storage.from("encrypted-blobs").download(path),
      ]);
      const { data, error: dlErr } = downloadRes;
      if (dlErr || !data) throw dlErr ?? new Error("Download failed.");
      const ciphertextBytes = new Uint8Array(await data.arrayBuffer());

      const plainBuf = await aesDecryptBytes(documentKey, { ciphertext: ciphertextBytes, iv });

      if (!useSanitized) {
        const recomputed = await sha256Hex(plainBuf);
        setIntegrityOk(recomputed === document.sha256_digest);
      }

      if (document.mime_type.startsWith("text") || useSanitized || document.mime_type === "text/csv") {
        setDecryptedText(bufToUtf8(plainBuf));
      } else {
        const blob = new Blob([new Uint8Array(plainBuf)], { type: document.mime_type });
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        setDecryptedText("(opened in a new tab)");
      }
      void target;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Decryption failed. Wrong key or corrupted ciphertext.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{document.title_safe}</CardTitle>
          <CardDescription>
            Uploaded {new Date(document.created_at).toLocaleString()} · {(document.byte_size / 1024).toFixed(0)} KB
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="success">
              Encrypted at rest
            </Badge>
            {document.privacy_scan_completed && <Badge variant="outline">Privacy scanned</Badge>}
            {sanitized && <Badge variant="outline">Sanitized derivative available</Badge>}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2">
            <Button onClick={() => onDecrypt(false)} disabled={busy}>
              Decrypt original
            </Button>
            {sanitized && (
              <Button variant="secondary" onClick={() => onDecrypt(true)} disabled={busy}>
                View sanitized version
              </Button>
            )}
          </div>

          {integrityOk !== null && (
            <div className="flex items-center gap-2 text-sm">
              {integrityOk ? (
                <>
                  <ShieldCheck className="h-4 w-4 text-success" />
                  <span>Document unchanged since upload — SHA-256 verified.</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="h-4 w-4 text-destructive" />
                  <span>Integrity check failed — recomputed hash does not match.</span>
                </>
              )}
            </div>
          )}

          {decryptedText && (
            <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-xs">
              {decryptedText}
            </pre>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Document Integrity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p className="font-mono text-xs break-all">SHA-256: {document.sha256_digest}</p>
          <p className="text-muted-foreground">Recomputed and compared on every decrypt.</p>
        </CardContent>
      </Card>
    </div>
  );
}
