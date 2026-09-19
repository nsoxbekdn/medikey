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
import { ProviderDocumentPreview } from "./ProviderDocumentPreview";
import { Check, Clock, FileText, Info, Lock, Shield, Users } from "lucide-react";
import { VitalsPoint } from "@/lib/db/types";
import { getDocumentPreviewKind, type DocumentPreviewKind } from "@/lib/provider/documentPreview";
import { parseProviderVitalsPayload } from "@/lib/provider/vitals";
import {
  chooseShareSecret,
  clearSessionShareSecret,
  readSessionShareSecret,
  storeSessionShareSecret,
} from "@/lib/provider/shareSecretSession";

type ProviderVitalsComponent = typeof import("./ProviderVitalsSection").ProviderVitalsSection;

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
  previewKind?: DocumentPreviewKind;
  text?: string;
  binary?: ArrayBuffer;
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

const SESSION_CLOSED: ScreenError = {
  title: "Provider session closed",
  description: "The decryption secret was removed from this browser tab. Reopen the original secure link to view this share.",
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
  const [VitalsRenderer, setVitalsRenderer] = useState<ProviderVitalsComponent | null>(null);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    // StrictMode double-invokes effects in dev; a second run would double-log
    // SHARE_OPENED and, for one-time links, could consume the share twice.
    if (started.current) return;
    started.current = true;
    (async () => {
      const fragmentSecret = readFragmentSecret();
      const secret = chooseShareSecret(fragmentSecret, readSessionShareSecret(shareId));
      try {
        if (!secret) {
          setError(DECRYPT_FAILURE);
          return;
        }

        let shareSecretKey: CryptoKey;
        try {
          shareSecretKey = await importShareSecret(secret);
        } catch {
          if (fragmentSecret) clearSessionShareSecret(shareId);
          setError(DECRYPT_FAILURE);
          return;
        }
        if (fragmentSecret) {
          // Persist only after successful validation. If sessionStorage is
          // unavailable, leave the fragment intact so refresh remains usable.
          try {
            storeSessionShareSecret(shareId, fragmentSecret);
            history.replaceState(null, "", location.pathname);
          } catch {
            // The validated fragment remains in the URL as a safe fallback.
          }
        }

        const accessRes = await fetch(`/api/shares/${shareId}/access`, { cache: "no-store" });
        const accessData = (await accessRes.json()) as StatusResponse & { items?: AccessItem[]; error?: string };
        if (accessData.shareId) setStatus(accessData);
        if (["EXPIRED", "REVOKED", "CONSUMED"].includes(accessData.status)) {
          clearSessionShareSecret(shareId);
        }
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
                    points: parseProviderVitalsPayload(bufToUtf8(plainBuf)),
                  };
                }
                const previewKind = getDocumentPreviewKind(item.kind, item.meta.mimeType);
                if (previewKind === "text") {
                  return {
                    itemId: item.itemId,
                    kind: item.kind,
                    meta: item.meta,
                    previewKind,
                    text: bufToUtf8(plainBuf),
                  };
                }
                return {
                  itemId: item.itemId,
                  kind: item.kind,
                  meta: item.meta,
                  previewKind,
                  binary: previewKind === "pdf" ? plainBuf : undefined,
                };
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
          const vitalsModule = await import("./ProviderVitalsSection");
          setVitalsRenderer(() => vitalsModule.ProviderVitalsSection);
        }
        const firstDoc = decrypted.find((item) => item.kind !== "vitals");
        if (firstDoc) setActiveDocId(firstDoc.itemId);
        setItems(decrypted);
        if (accessData.oneTime) clearSessionShareSecret(shareId);
        logEvent(shareId, "DECRYPTION_CONFIRMED");
      } catch {
        setError(UNREACHABLE);
      }
    })();
  }, [shareId]);

  const closeAndWipe = () => {
    clearSessionShareSecret(shareId);
    setItems(null);
    setStatus(null);
    setError(SESSION_CLOSED);
  };

  if (!status && !error) {
    return (
      <ProviderShell onCloseAndWipe={closeAndWipe}>
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

  const includedSummary = [
    documents.length > 0 ? `${documents.length} document${documents.length > 1 ? "s" : ""}` : null,
    vitalsItems.length > 0 ? `${vitalsItems.length} vitals series` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <ProviderShell status={status.status} onCloseAndWipe={closeAndWipe}>
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Secure Shared Record</h1>
          <p className="text-sm text-muted-foreground">Shared securely by a patient for clinical review.</p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <CountdownBadge expiresAt={status.expiresAt} />
            {status.oneTime && (
              <span className="text-xs font-medium text-muted-foreground">ONE-TIME ACCESS · usable once</span>
            )}
          </div>
        </div>

        {error && <ProviderStatusScreen title={error.title} description={error.description} />}

        {!items && !error && <ProviderSkeleton />}

        {items && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
            <div className="space-y-6">
              {documents.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-foreground">Clinical documents</h2>
                  </div>
                  {documents.length > 1 && (
                    <div className="mt-3 flex flex-wrap gap-2">
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
                    <div className="mt-4">
                      <div className="flex items-center gap-3 border-b border-border pb-4">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                          <FileText className="h-4.5 w-4.5" strokeWidth={2} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{itemLabel(activeDoc)}</p>
                          {typeof activeDoc.meta.mimeType === "string" && (
                            <p className="text-xs text-muted-foreground-soft">{activeDoc.meta.mimeType}</p>
                          )}
                        </div>
                      </div>
                      <div className="pt-5">
                        <ProviderDocumentPreview
                          previewKind={activeDoc.previewKind ?? "unsupported"}
                          title={itemLabel(activeDoc)}
                          text={activeDoc.text}
                          binary={activeDoc.binary}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {vitalsItems.length > 0 && VitalsRenderer && (
                <div className="space-y-4">
                  {vitalsItems.map((item) => (
                    <VitalsRenderer key={item.itemId} points={item.points ?? []} />
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-4">
              {items.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-foreground">Included in this share</h2>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {items.length} {items.length === 1 ? "file" : "items"}
                    </span>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {items.map((item) => (
                      <li key={item.itemId} className="flex items-start gap-2.5 rounded-lg bg-muted/50 p-2.5">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" strokeWidth={2.25} />
                        <span className="text-sm text-foreground">{itemLabel(item)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                    <span>Only patient-selected information is available through this share.</span>
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-border bg-card p-5">
                <h2 className="text-sm font-semibold text-foreground">Share details</h2>
                <dl className="mt-3 space-y-3 text-sm">
                  <div className="flex items-start gap-2.5">
                    <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground-soft" strokeWidth={2} />
                    <div>
                      <dt className="text-xs text-muted-foreground">Access</dt>
                      <dd className="font-medium text-foreground">Read only</dd>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground-soft" strokeWidth={2} />
                    <div>
                      <dt className="text-xs text-muted-foreground">Expires</dt>
                      <dd className="font-medium text-foreground">{new Date(status.expiresAt).toLocaleString()}</dd>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground-soft" strokeWidth={2} />
                    <div>
                      <dt className="text-xs text-muted-foreground">Included</dt>
                      <dd className="font-medium text-foreground">{includedSummary}</dd>
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground-soft" strokeWidth={2} />
                    <div>
                      <dt className="text-xs text-muted-foreground">Shared scope</dt>
                      <dd className="font-medium text-foreground">Selected information only</dd>
                    </div>
                  </div>
                </dl>
              </div>

              <div className="rounded-xl border border-blue/20 bg-blue-soft p-5">
                <div className="flex items-start gap-2.5">
                  <Shield className="mt-0.5 h-4 w-4 shrink-0 text-blue" strokeWidth={2} />
                  <div>
                    <p className="text-sm font-semibold text-primary">Secure and private</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      This record was encrypted before remote storage and is decrypted locally in this browser.
                      Access is limited to information selected by the patient.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProviderShell>
  );
}
