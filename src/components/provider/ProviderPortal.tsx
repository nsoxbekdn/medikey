"use client";

import { useEffect, useRef, useState } from "react";
import { readFragmentSecret } from "@/lib/sharing/url";
import { importShareSecret } from "@/lib/sharing/secret";
import { aesDecrypt, aesDecryptBytes, importAesKeyRaw } from "@/lib/crypto/aes";
import { bufToUtf8 } from "@/lib/crypto/encoding";
import { CountdownBadge } from "./CountdownBadge";
import { ProviderShell } from "./ProviderShell";
import { ProviderSkeleton } from "./ProviderSkeleton";
import { ProviderStatusScreen } from "./ProviderStatusScreen";
import { Check } from "lucide-react";
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

interface ScreenError {
  title: string;
  description: string;
}

const DECRYPT_FAILURE: ScreenError = {
  title: "Unable to decrypt shared record",
  description: "The secure link is valid, but the decryption secret is missing or incorrect.",
};

const UNAVAILABLE: ScreenError = {
  title: "Shared record unavailable",
  description: "This secure share could not be found or is no longer available.",
};

const UNREACHABLE: ScreenError = {
  title: "Shared record unavailable",
  description: "Could not reach MediKey. Try again shortly.",
};

const NON_ACTIVE_COPY: Record<string, ScreenError> = {
  EXPIRED: {
    title: "Access expired",
    description: "This patient-controlled share is no longer available.",
  },
  REVOKED: {
    title: "Access revoked",
    description: "The patient has withdrawn future access to this shared record.",
  },
  CONSUMED: {
    title: "One-time access used",
    description: "This secure link has already been consumed and is no longer available.",
  },
};

function itemLabel(item: DecryptedItem): string {
  if (item.kind === "vitals") {
    const name = (item.meta.name as string) ?? "Vitals series";
    const metrics = (item.meta.selectedMetrics as string[] | undefined) ?? [];
    return metrics.length > 0 ? `${name} (${metrics.join(", ")})` : name;
  }
  return (item.meta.title as string) ?? "Record";
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
  const [error, setError] = useState<ScreenError | null>(null);
  const [VitalsChartRenderer, setVitalsChartRenderer] = useState<VitalsChartsComponent | null>(null);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
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
          setError(DECRYPT_FAILURE);
          return;
        }

        let shareSecretKey: CryptoKey;
        try {
          shareSecretKey = await importShareSecret(secret);
        } catch {
          setError(DECRYPT_FAILURE);
          return;
        }
        // Key is in memory now; drop the fragment from the address bar / history.
        history.replaceState(null, "", location.pathname);

        const accessRes = await fetch(`/api/shares/${shareId}/access`, { cache: "no-store" });
        const accessData = (await accessRes.json()) as StatusResponse & { items?: AccessItem[]; error?: string };
        if (accessData.shareId) setStatus(accessData);
        if (!accessRes.ok) {
          if (!accessData.shareId) setError(UNAVAILABLE);
          return;
        }
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
          setError(DECRYPT_FAILURE);
          return;
        }
        if (decrypted.some((item) => item.kind === "vitals")) {
          // A direct import here (instead of next/dynamic) prevents Next from
          // preloading Recharts for document-only provider shares.
          const chartModule = await import("@/components/vitals/VitalsCharts");
          setVitalsChartRenderer(() => chartModule.VitalsCharts);
        }
        const firstDoc = decrypted.find((item) => item.kind !== "vitals");
        if (firstDoc) setActiveDocId(firstDoc.itemId);
        setItems(decrypted);
        logEvent(shareId, "DECRYPTION_CONFIRMED");
      } catch {
        setError(UNREACHABLE);
      }
    })();
  }, [shareId]);

  if (!status && !error) {
    return (
      <ProviderShell>
        <ProviderSkeleton />
      </ProviderShell>
    );
  }

  if (!status) {
    return (
      <ProviderShell>
        <ProviderStatusScreen title={error!.title} description={error!.description} />
      </ProviderShell>
    );
  }

  if (status.status !== "ACTIVE") {
    const copy = NON_ACTIVE_COPY[status.status];
    return (
      <ProviderShell status={status.status}>
        <ProviderStatusScreen
          title={copy.title}
          description={copy.description}
          meta={status.status === "EXPIRED" ? `Access ended: ${new Date(status.expiresAt).toLocaleString()}` : undefined}
        />
      </ProviderShell>
    );
  }

  const documents = items?.filter((item) => item.kind !== "vitals") ?? [];
  const vitalsItems = items?.filter((item) => item.kind === "vitals") ?? [];
  const activeDoc = documents.find((d) => d.itemId === activeDocId) ?? documents[0];

  return (
    <ProviderShell status={status.status}>
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-foreground">Secure Shared Record</h1>
          <p className="text-sm text-muted-foreground">Shared securely by a patient for clinical review.</p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <CountdownBadge expiresAt={status.expiresAt} />
            {status.oneTime && (
              <span className="text-xs font-medium text-muted-foreground">ONE-TIME ACCESS · usable once</span>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Access</dt>
              <dd className="font-medium">Read only</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Expires</dt>
              <dd className="font-medium">{new Date(status.expiresAt).toLocaleString()}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Included</dt>
              <dd className="font-medium">
                {documents.length > 0 && `${documents.length} document${documents.length > 1 ? "s" : ""}`}
                {documents.length > 0 && vitalsItems.length > 0 && ", "}
                {vitalsItems.length > 0 && `${vitalsItems.length} vitals series`}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Shared scope</dt>
              <dd className="font-medium">Selected information only</dd>
            </div>
          </dl>
        </div>

        {items && items.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Included in this share</p>
            <ul className="space-y-1.5">
              {items.map((item) => (
                <li key={item.itemId} className="flex items-center gap-2 text-sm text-foreground">
                  <Check className="h-3.5 w-3.5 shrink-0 text-success" strokeWidth={2} />
                  {itemLabel(item)}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              Only patient-selected information is available through this share.
            </p>
          </div>
        )}

        {error && <ProviderStatusScreen title={error.title} description={error.description} />}

        {!items && !error && <ProviderSkeleton />}

        {documents.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Clinical document</p>
            {documents.length > 1 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {documents.map((doc) => (
                  <button
                    key={doc.itemId}
                    onClick={() => setActiveDocId(doc.itemId)}
                    className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                      activeDoc?.itemId === doc.itemId
                        ? "border-primary bg-secondary text-primary"
                        : "border-border text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {itemLabel(doc)}
                  </button>
                ))}
              </div>
            )}
            {activeDoc && (
              <div className="rounded-lg border border-border bg-card p-6">
                <p className="text-base font-medium text-foreground">{itemLabel(activeDoc)}</p>
                {typeof activeDoc.meta.mimeType === "string" && (
                  <p className="text-xs text-muted-foreground">{activeDoc.meta.mimeType}</p>
                )}
                <div className="my-4 h-px bg-border" />
                <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{activeDoc.text}</div>
              </div>
            )}
          </div>
        )}

        {vitalsItems.length > 0 && VitalsChartRenderer && (
          <div className="space-y-4">
            <p className="text-sm font-medium text-foreground">Shared vitals</p>
            {vitalsItems.map((item) => (
              <VitalsChartRenderer key={item.itemId} points={item.points ?? []} />
            ))}
          </div>
        )}
      </div>
    </ProviderShell>
  );
}
