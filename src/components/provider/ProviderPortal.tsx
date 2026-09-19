"use client";

import { useEffect, useRef, useState } from "react";
import { readFragmentSecret } from "@/lib/sharing/url";
import { importShareSecret } from "@/lib/sharing/secret";
import { aesDecrypt, importAesKeyRaw } from "@/lib/crypto/aes";
import { bufToUtf8 } from "@/lib/crypto/encoding";
import { VitalsCharts } from "@/components/vitals/VitalsCharts";
import { CountdownBadge } from "./CountdownBadge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck } from "lucide-react";
import { VitalsPoint } from "@/lib/db/types";

interface StatusResponse {
  shareId: string;
  status: "ACTIVE" | "REVOKED" | "EXPIRED" | "CONSUMED";
  providerLabel: string;
  purpose: string;
  expiresAt: string;
  oneTime: boolean;
  itemCount: number;
}

interface PayloadItem {
  itemId: string;
  kind: "document" | "sanitized_document" | "vitals";
  ciphertext: string;
  iv: string;
  wrappedAccessKey: string;
  wrappingIv: string;
  meta: Record<string, unknown>;
}

interface DecryptedItem {
  itemId: string;
  kind: PayloadItem["kind"];
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
  const started = useRef(false);

  useEffect(() => {
    // StrictMode double-invokes effects in dev; a second run would double-log
    // SHARE_OPENED and, for one-time links, could consume the share twice.
    if (started.current) return;
    started.current = true;
    (async () => {
      const secret = readFragmentSecret();
      try {
        const statusRes = await fetch(`/api/shares/${shareId}/status`);
        const statusData: StatusResponse = await statusRes.json();
        setStatus(statusData);

        if (statusData.status !== "ACTIVE") return;
        if (!secret) {
          setError(
            "Missing decryption secret. The secret lives only in the original link (after #) and is cleared from this page once read — open the link from the patient again.",
          );
          return;
        }
        logEvent(shareId, "SHARE_OPENED");
        setOpened(true);

        let shareSecretKey: CryptoKey;
        try {
          shareSecretKey = await importShareSecret(secret);
        } catch {
          setError("The link secret looks corrupted.");
          return;
        }
        // Key is in memory now; drop the fragment from the address bar / history.
        history.replaceState(null, "", location.pathname);

        const payloadRes = await fetch(`/api/shares/${shareId}/payload`);
        if (!payloadRes.ok) {
          const body = await payloadRes.json();
          setError(body.error ?? "This share is no longer available.");
          return;
        }
        const { items: rawItems } = (await payloadRes.json()) as { items: PayloadItem[] };

        const decrypted: DecryptedItem[] = [];
        for (const item of rawItems) {
          try {
            const rawKey = await aesDecrypt(shareSecretKey, {
              ciphertext: item.wrappedAccessKey,
              iv: item.wrappingIv,
            });
            const itemKey = await importAesKeyRaw(new Uint8Array(rawKey));
            const plainBuf = await aesDecrypt(itemKey, { ciphertext: item.ciphertext, iv: item.iv });

            if (item.kind === "vitals") {
              decrypted.push({ itemId: item.itemId, kind: item.kind, meta: item.meta, points: JSON.parse(bufToUtf8(plainBuf)) });
            } else {
              decrypted.push({ itemId: item.itemId, kind: item.kind, meta: item.meta, text: bufToUtf8(plainBuf) });
            }
          } catch {
            // Wrong/corrupted key for this item — skip it rather than crash the whole view.
          }
        }
        if (decrypted.length === 0 && rawItems.length > 0) {
          setError("Decryption failed for every shared record — the link secret is wrong or the data is corrupted.");
          return;
        }
        setItems(decrypted);
        logEvent(shareId, "DECRYPTION_CONFIRMED");
        if (statusData.oneTime) {
          await fetch(`/api/shares/${shareId}/consume`, { method: "POST" });
        }
      } catch {
        setError("Could not reach MediKey. Try again shortly.");
      }
    })();
  }, [shareId]);

  if (!status) return <p className="p-8 text-center text-sm text-muted-foreground">Checking share status...</p>;

  if (status.status !== "ACTIVE") {
    const messages: Record<string, string> = {
      REVOKED: "The patient has withdrawn access to these records.",
      EXPIRED: "This patient-controlled share is no longer available.",
      CONSUMED: "This one-time link has already been used.",
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
            {item.kind === "vitals" && item.points ? (
              <VitalsCharts points={item.points} />
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
