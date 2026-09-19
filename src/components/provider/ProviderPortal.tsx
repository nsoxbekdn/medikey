"use client";

import { useEffect, useRef, useState } from "react";
import { readFragmentSecret } from "@/lib/sharing/url";
import { importShareSecret } from "@/lib/sharing/secret";
import { aesDecrypt, aesDecryptBytes, importAesKeyRaw } from "@/lib/crypto/aes";
import { bufToUtf8 } from "@/lib/crypto/encoding";
import { CountdownBadge } from "./CountdownBadge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck } from "lucide-react";
import { VitalsPoint } from "@/lib/db/types";

type VitalsChartsComponent = typeof import("@/components/vitals/VitalsCharts").VitalsCharts;

interface StatusResponse {
  shareId: string;
  status: "ACTIVE" | "REVOKED" | "EXPIRED" | "CONSUMED";
  providerLabel: string;
  purpose: string;
  expiresAt: string;
  oneTime: boolean;
  itemCount: number;
}

interface AccessItem {
  itemId: string;
  kind: "document" | "sanitized_document" | "vitals";
  ciphertextUrl: string;
  iv: string;
  wrappedAccessKey: string;
  wrappingIv: string;
  meta: Record<string, unknown>;
}

interface DecryptedItem {
  itemId: string;
  kind: AccessItem["kind"];
  meta: Record<string, unknown>;
  text?: string;
  points?: VitalsPoint[];
}

function logEvent(shareId: string, eventType: string) {
  fetch(`/api/shares/${shareId}/event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eventType, actorType: "provider" }),
  }).catch(() => {});
}

export function ProviderPortal({ shareId }: { shareId: string }) {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [items, setItems] = useState<DecryptedItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [VitalsChartRenderer, setVitalsChartRenderer] = useState<VitalsChartsComponent | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // StrictMode double-invokes effects in dev; a second run would double-log
    // SHARE_OPENED and, for one-time links, could consume the share twice.
    if (started.current) return;
    started.current = true;
    (async () => {
      const secret = readFragmentSecret();
      try {
        if (!secret) {
          setError("Unable to decrypt shared record. Open the original secure link from the patient.");
          return;
        }

        let shareSecretKey: CryptoKey;
        try {
          shareSecretKey = await importShareSecret(secret);
        } catch {
          setError("Unable to decrypt shared record.");
          return;
        }
        // Key is in memory now; drop the fragment from the address bar / history.
        history.replaceState(null, "", location.pathname);

        const accessRes = await fetch(`/api/shares/${shareId}/access`, { cache: "no-store" });
        const accessData = (await accessRes.json()) as StatusResponse & { items?: AccessItem[]; error?: string };
        if (accessData.shareId) setStatus(accessData);
        if (!accessRes.ok) {
          if (!accessData.shareId) setError(accessData.error ?? "This share is no longer available.");
          return;
        }
        setOpened(true);
        const rawItems = accessData.items ?? [];

        const decrypted = (
          await Promise.all(
            rawItems.map(async (item): Promise<DecryptedItem | null> => {
              try {
                // All ciphertext downloads are parallel and go straight to private
                // Storage. The application server never buffers or base64-encodes them.
                const [rawKey, ciphertextResponse] = await Promise.all([
                  aesDecrypt(shareSecretKey, { ciphertext: item.wrappedAccessKey, iv: item.wrappingIv }),
                  fetch(item.ciphertextUrl, { cache: "no-store" }),
                ]);
                if (!ciphertextResponse.ok) return null;
                const itemKey = await importAesKeyRaw(new Uint8Array(rawKey));
                const ciphertext = new Uint8Array(await ciphertextResponse.arrayBuffer());
                const plainBuf = await aesDecryptBytes(itemKey, { ciphertext, iv: item.iv });

                if (item.kind === "vitals") {
                  return {
                    itemId: item.itemId,
                    kind: item.kind,
                    meta: item.meta,
                    points: JSON.parse(bufToUtf8(plainBuf)),
                  };
                }
                return { itemId: item.itemId, kind: item.kind, meta: item.meta, text: bufToUtf8(plainBuf) };
              } catch {
                // Wrong/corrupted key for this item — skip it rather than crash the whole view.
                return null;
              }
            }),
          )
        ).filter((item): item is DecryptedItem => item !== null);
        if (decrypted.length === 0 && rawItems.length > 0) {
          setError("Unable to decrypt shared record.");
          return;
        }
        if (decrypted.some((item) => item.kind === "vitals")) {
          // A direct import here (instead of next/dynamic) prevents Next from
          // preloading Recharts for document-only provider shares.
          const chartModule = await import("@/components/vitals/VitalsCharts");
          setVitalsChartRenderer(() => chartModule.VitalsCharts);
        }
        setItems(decrypted);
        logEvent(shareId, "DECRYPTION_CONFIRMED");
      } catch {
        setError("Could not reach MediKey. Try again shortly.");
      }
    })();
  }, [shareId]);

  if (!status && !error) return <p className="p-8 text-center text-sm text-muted-foreground">Opening secure share...</p>;

  if (!status) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </main>
    );
  }

  if (status.status !== "ACTIVE") {
    const messages: Record<string, string> = {
      REVOKED: "Access revoked.",
      EXPIRED: "Access expired.",
      CONSUMED: "One-time access used.",
    };
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">ACCESS {status.status}</h1>
        <p className="mt-2 text-muted-foreground">{messages[status.status]}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <Card>
        <CardHeader className="space-y-2">
          <CardTitle>MediKey Secure Record</CardTitle>
          <CardDescription>Shared for: {status.purpose}</CardDescription>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Badge variant="outline">READ ONLY</Badge>
            <CountdownBadge expiresAt={status.expiresAt} />
            {status.oneTime && <Badge variant="outline">One-time link</Badge>}
          </div>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          Records are decrypted inside this browser.
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!items && !error && opened && (
        <p className="text-sm text-muted-foreground">Decrypting shared records in this browser...</p>
      )}

      {items?.map((item) => (
        <Card key={item.itemId}>
          <CardHeader>
            <CardTitle className="text-base">
              {item.kind === "vitals" ? (item.meta.name as string) : (item.meta.title as string) ?? "Record"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {item.kind === "vitals" && item.points && VitalsChartRenderer ? (
              <VitalsChartRenderer points={item.points} />
            ) : (
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-xs">
                {item.text}
              </pre>
            )}
          </CardContent>
        </Card>
      ))}
    </main>
  );
}
