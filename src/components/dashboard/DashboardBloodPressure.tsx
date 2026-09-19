"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { VitalsDatasetRow, VitalsPoint } from "@/lib/db/types";
import { useVault } from "@/lib/vault/VaultProvider";
import { unwrapKey } from "@/lib/crypto/key-wrap";
import { aesDecryptBytes } from "@/lib/crypto/aes";
import { bufToUtf8 } from "@/lib/crypto/encoding";
import { createSupabaseBrowserClient } from "@/lib/db/client";

const DashboardBloodPressureChart = dynamic(
  () => import("./DashboardBloodPressureChart").then((module) => module.DashboardBloodPressureChart),
  { loading: () => <div className="h-44 animate-pulse rounded-lg bg-muted" /> },
);

export function DashboardBloodPressure({ dataset }: { dataset: VitalsDatasetRow | null }) {
  const { vault } = useVault();
  const [points, setPoints] = useState<VitalsPoint[] | null>(null);

  useEffect(() => {
    if (!vault || !dataset) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const [key, result] = await Promise.all([
          unwrapKey(vault.rootKey, { ciphertext: dataset.wrapped_dataset_key, iv: dataset.wrapping_iv }),
          supabase.storage.from("encrypted-blobs").download(dataset.encrypted_payload_path),
        ]);
        if (result.error || !result.data) return;
        const ciphertext = new Uint8Array(await result.data.arrayBuffer());
        const plaintext = await aesDecryptBytes(key, { ciphertext, iv: dataset.encryption_iv });
        if (!cancelled) setPoints(JSON.parse(bufToUtf8(plaintext)));
      } catch {
        // Keep the restrained unavailable state; medical data errors stay local.
      }
    })();
    return () => { cancelled = true; };
  }, [dataset, vault]);

  if (!dataset) return <EmptyBloodPressure message="No blood pressure dataset yet." />;
  if (!vault) return <EmptyBloodPressure message="Unlock your vault to view blood pressure." />;
  if (!points) return <div className="h-56 animate-pulse rounded-lg bg-muted" aria-label="Decrypting blood pressure" />;
  return <DashboardBloodPressureChart points={points} />;
}

function EmptyBloodPressure({ message }: { message: string }) {
  return <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">{message}</div>;
}
