"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { VitalsDatasetRow, VitalsPoint } from "@/lib/db/types";
import { useVault } from "@/lib/vault/VaultProvider";
import { unwrapKey } from "@/lib/crypto/key-wrap";
import { aesDecryptBytes } from "@/lib/crypto/aes";
import { bufToUtf8 } from "@/lib/crypto/encoding";
import { createSupabaseBrowserClient } from "@/lib/db/client";
import { VitalsCharts } from "./VitalsCharts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export function VitalsDatasetViewer({ dataset }: { dataset: VitalsDatasetRow }) {
  const { vault } = useVault();
  const router = useRouter();
  const [points, setPoints] = useState<VitalsPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!vault) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        // Key unwrap (CPU) and blob download (network) are independent.
        const [key, downloadRes] = await Promise.all([
          unwrapKey(vault.rootKey, { ciphertext: dataset.wrapped_dataset_key, iv: dataset.wrapping_iv }),
          supabase.storage.from("encrypted-blobs").download(dataset.encrypted_payload_path),
        ]);
        const { data, error: dlErr } = downloadRes;
        if (dlErr || !data) throw dlErr ?? new Error("Download failed.");
        const ciphertextBytes = new Uint8Array(await data.arrayBuffer());
        const plainBuf = await aesDecryptBytes(key, { ciphertext: ciphertextBytes, iv: dataset.encryption_iv });
        if (!cancelled) setPoints(JSON.parse(bufToUtf8(plainBuf)));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Decryption failed.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vault, dataset]);

  async function onDelete() {
    if (!confirm(`Delete dataset "${dataset.name}"? This cannot be undone.`)) return;
    const supabase = createSupabaseBrowserClient();
    await supabase.storage.from("encrypted-blobs").remove([dataset.encrypted_payload_path]);
    await supabase.from("vitals_datasets").delete().eq("id", dataset.id);
    router.push("/vitals");
    router.refresh();
  }

  if (error)
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );

  if (!points) return <p className="text-sm text-muted-foreground">Decrypting in your browser...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{dataset.name}</h1>
          <p className="text-sm text-muted-foreground">
            {new Date(dataset.start_at).toLocaleDateString()} – {new Date(dataset.end_at).toLocaleDateString()}
          </p>
        </div>
        <Button variant="destructive" size="sm" onClick={onDelete}>
          Delete dataset
        </Button>
      </div>
      <VitalsCharts points={points} />
    </div>
  );
}
