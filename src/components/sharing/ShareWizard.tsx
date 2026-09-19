"use client";

import { useEffect, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useVault } from "@/lib/vault/VaultProvider";
import { createSupabaseBrowserClient } from "@/lib/db/client";
import { DocumentRow, SanitizedArtifactRow, VitalsDatasetRow, VitalsPoint } from "@/lib/db/types";
import { unwrapKey } from "@/lib/crypto/key-wrap";
import { aesDecryptBytes, aesEncrypt, aesEncryptBytes, generateAesKey, exportAesKeyRaw } from "@/lib/crypto/aes";
import { bufToUtf8, utf8ToBuf } from "@/lib/crypto/encoding";
import { generateShareSecret } from "@/lib/sharing/secret";
import { buildShareUrl } from "@/lib/sharing/url";
import { SHARE_DURATION_PRESETS } from "@/lib/sharing/status";
import { mapWithConcurrency } from "@/lib/async/concurrency";
import { toast } from "sonner";
import { selectVitalsMetrics, SHAREABLE_VITAL_METRICS, ShareableVitalsMetric } from "@/lib/sharing/vitals";
import { CountdownBadge } from "@/components/provider/CountdownBadge";
import { CustomExpiryPicker } from "@/components/sharing/CustomExpiryPicker";

// Bounded, not unbounded Promise.all: caps how many decrypted vitals buffers
// (and re-encryption jobs) are held in memory at once when a share includes
// several datasets.
const VITALS_SHARE_CONCURRENCY = 4;

type SelectableDoc = DocumentRow & { sanitized: SanitizedArtifactRow | null };

export function ShareWizard() {
  const { vault } = useVault();
  const [step, setStep] = useState(1);
  const [docs, setDocs] = useState<SelectableDoc[]>([]);
  const [datasets, setDatasets] = useState<VitalsDatasetRow[]>([]);

  const [providerLabel, setProviderLabel] = useState("");
  const [providerType, setProviderType] = useState("General consultation");
  const [purpose, setPurpose] = useState("");

  const [selectedDocs, setSelectedDocs] = useState<Record<string, "original" | "sanitized">>({});
  const [selectedDatasets, setSelectedDatasets] = useState<Record<string, Set<string>>>({});

  const [durationPreset, setDurationPreset] = useState<string>(SHARE_DURATION_PRESETS[1].label);
  const [oneTime, setOneTime] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<
    { shareId: string; url: string; qrDataUrl: string; receiptCode: string; expiresAt: string } | null
  >(null);
  const [qrVisible, setQrVisible] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) return;
      // Three independent reads — fetch concurrently instead of one after another.
      const [{ data: documents }, { data: sanitizedArtifacts }, { data: vitalsData }] = await Promise.all([
        supabase.from("documents").select("*").eq("owner_id", user.id),
        supabase.from("sanitized_artifacts").select("*").eq("owner_id", user.id),
        supabase.from("vitals_datasets").select("*").eq("owner_id", user.id),
      ]);
      const merged: SelectableDoc[] = (documents ?? []).map((d) => ({
        ...(d as DocumentRow),
        sanitized: (sanitizedArtifacts as SanitizedArtifactRow[] | null)?.find((s) => s.document_id === d.id) ?? null,
      }));
      setDocs(merged);
      setDatasets((vitalsData as VitalsDatasetRow[] | null) ?? []);
    })();
  }, []);

  const selectedDocCount = Object.keys(selectedDocs).length;
  const selectedMetricCount = Object.values(selectedDatasets).reduce((sum, s) => sum + s.size, 0);
  const directIdentifierCount = useMemo(() => {
    // Sanitized selections carry zero direct identifiers by construction; only
    // an "original" selection risks exposing them.
    return Object.values(selectedDocs).filter((v) => v === "original").length;
  }, [selectedDocs]);
  const selectedVitalsDatasetCount = Object.keys(selectedDatasets).length;
  const notSharedDocCount = docs.length - selectedDocCount;
  const notSharedMetricCount = datasets.length * SHAREABLE_VITAL_METRICS.length - selectedMetricCount;

  function toggleDoc(id: string, mode: "original" | "sanitized") {
    setSelectedDocs((prev) => {
      const next = { ...prev };
      if (next[id] === mode) delete next[id];
      else next[id] = mode;
      return next;
    });
  }

  function toggleMetric(datasetId: string, metric: string) {
    setSelectedDatasets((prev) => {
      const next = { ...prev };
      const set = new Set(next[datasetId] ?? []);
      if (set.has(metric)) set.delete(metric);
      else set.add(metric);
      if (set.size === 0) delete next[datasetId];
      else next[datasetId] = set;
      return next;
    });
  }

  const [customExpiry, setCustomExpiry] = useState("");

  async function onCreateShare() {
    if (!vault) return;
    const expiresAt =
      durationPreset === "custom"
        ? customExpiry
        : new Date(Date.now() + (SHARE_DURATION_PRESETS.find((p) => p.label === durationPreset)?.ms ?? 0)).toISOString();
    setBusy(true);
    setError(null);
    const uploadedSharePaths: string[] = [];
    const supabase = createSupabaseBrowserClient();
    try {
      const [{ key: shareSecretKey, secretB64Url }, sessionRes] = await Promise.all([
        generateShareSecret(),
        supabase.auth.getSession(),
      ]);
      const user = sessionRes.data.session?.user;
      if (!user) throw new Error("Not signed in.");

      type ShareItemInput = {
        documentId?: string;
        sanitizedArtifactId?: string;
        vitalsDatasetId?: string;
        selectedMetrics?: string[];
        wrappedAccessKey: string;
        wrappingIv: string;
        encryptedStoragePath?: string;
        encryptionIv?: string;
      };
      const items: ShareItemInput[] = [];

      const docIds = Object.keys(selectedDocs);
      if (docIds.length > 0) {
        // One bulk query instead of one `document_key_wrappers` select per document.
        const { data: wrappers } = await supabase.from("document_key_wrappers").select("*").in("document_id", docIds);
        for (const docId of docIds) {
          const mode = selectedDocs[docId];
          const doc = docs.find((d) => d.id === docId);
          const wrapper = wrappers?.find((w) => w.document_id === docId);
          if (!doc || !wrapper) continue;
          const documentKey = await unwrapKey(vault.rootKey, {
            ciphertext: wrapper.wrapped_document_key,
            iv: wrapper.wrapping_iv,
          });
          const rewrapped = await exportAesKeyRaw(documentKey);
          const wrapped = await aesEncrypt(shareSecretKey, rewrapped);

          if (mode === "sanitized" && doc.sanitized) {
            items.push({ sanitizedArtifactId: doc.sanitized.id, wrappedAccessKey: wrapped.ciphertext, wrappingIv: wrapped.iv });
          } else {
            items.push({ documentId: doc.id, wrappedAccessKey: wrapped.ciphertext, wrappingIv: wrapped.iv });
          }
        }
      }

      const datasetEntries = Object.entries(selectedDatasets);
      const vitalsItems = await mapWithConcurrency(datasetEntries, VITALS_SHARE_CONCURRENCY, async ([datasetId, metrics]) => {
        const dataset = datasets.find((d) => d.id === datasetId);
        if (!dataset) return null;

        // Key unwrap (CPU) and blob download (network) are independent.
        const [datasetKey, { data: blob }] = await Promise.all([
          unwrapKey(vault.rootKey, { ciphertext: dataset.wrapped_dataset_key, iv: dataset.wrapping_iv }),
          supabase.storage.from("encrypted-blobs").download(dataset.encrypted_payload_path),
        ]);
        const bytes = new Uint8Array(await blob!.arrayBuffer());
        const plainBuf = await aesDecryptBytes(datasetKey, { ciphertext: bytes, iv: dataset.encryption_iv });
        const points: VitalsPoint[] = JSON.parse(bufToUtf8(plainBuf));

        const metricList = Array.from(metrics) as ShareableVitalsMetric[];
        const filtered = selectVitalsMetrics(points, metricList);

        const ephemeralKey = await generateAesKey();
        const encrypted = await aesEncryptBytes(ephemeralKey, utf8ToBuf(JSON.stringify(filtered)));
        const path = `${user.id}/${uuidv4()}`;
        const { error: uploadError } = await supabase.storage
          .from("encrypted-blobs")
          .upload(path, encrypted.ciphertext as BlobPart, { contentType: "application/octet-stream" });
        if (uploadError) throw uploadError;
        uploadedSharePaths.push(path);

        const ephemeralRaw = await exportAesKeyRaw(ephemeralKey);
        const wrapped = await aesEncrypt(shareSecretKey, ephemeralRaw);

        const item: ShareItemInput = {
          vitalsDatasetId: datasetId,
          selectedMetrics: metricList,
          wrappedAccessKey: wrapped.ciphertext,
          wrappingIv: wrapped.iv,
          encryptedStoragePath: path,
          encryptionIv: encrypted.iv,
        };
        return item;
      });
      for (const item of vitalsItems) if (item) items.push(item);

      if (items.length === 0) throw new Error("Select at least one document or vitals metric to share.");

      const res = await fetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerLabel,
          providerType,
          purpose,
          expiresAt,
          oneTime,
          items,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to create share.");
      const { shareId, receiptCode } = await res.json();

      const url = buildShareUrl(window.location.origin, shareId, secretB64Url);
      // QR generation is optional and relatively heavy; load it only after a
      // share exists and a QR code is actually requested for the result view.
      const QRCode = (await import("qrcode")).default;
      const qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 240 });
      setResult({ shareId, url, qrDataUrl, receiptCode, expiresAt });
      toast.success("Secure share created.");
    } catch (err) {
      // Vitals use share-specific ciphertext. If the transaction fails, remove
      // only the blobs created by this attempt so private Storage has no orphans.
      if (uploadedSharePaths.length > 0) {
        await supabase.storage.from("encrypted-blobs").remove(uploadedSharePaths).catch(() => undefined);
      }
      setError(err instanceof Error ? err.message : "Failed to create share.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    async function copyLink() {
      await navigator.clipboard.writeText(result!.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle>Secure share created</CardTitle>
          <CardDescription>Consent receipt {result.receiptCode}</CardDescription>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <CountdownBadge expiresAt={result.expiresAt} />
            {oneTime && <Badge variant="outline">One-time link</Badge>}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Row label="Recipient" value={providerLabel} />

          {oneTime && (
            <Alert>
              <AlertDescription>
                <strong>ONE-TIME ACCESS.</strong> This secure link can be used once. It also expires automatically if unused.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label>Secure link</Label>
            <div className="flex gap-2">
              <Input readOnly value={result.url} onFocus={(e) => e.currentTarget.select()} />
              <Button type="button" variant="secondary" onClick={copyLink}>
                {copied ? "Copied" : "Copy secure link"}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" onClick={() => setQrVisible((v) => !v)}>
              {qrVisible ? "Hide QR" : "Show QR"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              nativeButton={false}
              render={
                <a href={result.url} target="_blank" rel="noopener noreferrer">
                  Open provider preview
                </a>
              }
            />
          </div>

          {qrVisible && (
            <div className="space-y-2">
              <img src={result.qrDataUrl} alt="Share QR code" className="w-full max-w-[280px] rounded-md border sm:w-[280px]" />
              <p className="text-xs text-muted-foreground">Doctor can scan this code to open the secure provider portal.</p>
            </div>
          )}

          <Alert>
            <AlertDescription>
              The decryption secret is in the URL fragment after <code>#</code> — it is never sent to the server.
            </AlertDescription>
          </Alert>
          <Button variant="secondary" nativeButton={false} render={<Link href="/shares">Go to Shares dashboard</Link>} />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Step 1 — Recipient</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Provider name / label</Label>
              <Input value={providerLabel} onChange={(e) => setProviderLabel(e.target.value)} placeholder="Dr. A. Sharma" />
              <p className="text-xs text-muted-foreground">Patient-specified — not independently verified.</p>
            </div>
            <div className="space-y-2">
              <Label>Provider type</Label>
              <Input value={providerType} onChange={(e) => setProviderType(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Purpose</Label>
              <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Second opinion" />
            </div>
            <Button onClick={() => setStep(2)} disabled={!providerLabel || !purpose}>
              Next: choose data
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Step 2 — Choose data</CardTitle>
            <CardDescription>Share what is necessary, not everything stored.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-medium">Documents</p>
              <ul className="space-y-2">
                {docs.map((doc) => (
                  <li key={doc.id} className="rounded-md border px-3 py-2">
                    <p className="text-sm font-medium">{doc.title_safe}</p>
                    <div className="mt-1 flex gap-4 text-sm">
                      <label className="flex items-center gap-2">
                        <Checkbox
                          checked={selectedDocs[doc.id] === "original"}
                          onCheckedChange={() => toggleDoc(doc.id, "original")}
                        />
                        Original
                      </label>
                      <label className="flex items-center gap-2">
                        <Checkbox
                          checked={selectedDocs[doc.id] === "sanitized"}
                          onCheckedChange={() => toggleDoc(doc.id, "sanitized")}
                          disabled={!doc.sanitized}
                        />
                        Sanitized {!doc.sanitized && "(none)"}
                      </label>
                    </div>
                  </li>
                ))}
                {docs.length === 0 && <p className="text-sm text-muted-foreground">No documents in vault.</p>}
              </ul>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Vitals metrics</p>
              <ul className="space-y-2">
                {datasets.map((ds) => (
                  <li key={ds.id} className="rounded-md border px-3 py-2">
                    <p className="text-sm font-medium">{ds.name}</p>
                    <div className="mt-1 flex flex-wrap gap-3 text-sm">
                      {SHAREABLE_VITAL_METRICS.map((metric) => (
                        <label key={metric} className="flex items-center gap-2">
                          <Checkbox
                            checked={selectedDatasets[ds.id]?.has(metric) ?? false}
                            onCheckedChange={() => toggleMetric(ds.id, metric)}
                          />
                          {metric}
                        </label>
                      ))}
                    </div>
                  </li>
                ))}
                {datasets.length === 0 && <p className="text-sm text-muted-foreground">No vitals datasets.</p>}
              </ul>
            </div>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button onClick={() => setStep(3)} disabled={selectedDocCount === 0 && selectedMetricCount === 0}>
                Next: privacy review
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Step 3 — Privacy review</CardTitle>
            <CardDescription>Only selected information will be included in this share.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-md border p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">You are sharing</p>
                <ul className="space-y-1">
                  {docs
                    .filter((d) => selectedDocs[d.id])
                    .map((d) => (
                      <li key={d.id}>
                        {d.title_safe} <span className="text-muted-foreground">({selectedDocs[d.id]})</span>
                      </li>
                    ))}
                  {Object.entries(selectedDatasets).map(([id, metrics]) => (
                    <li key={id}>
                      {datasets.find((d) => d.id === id)?.name} <span className="text-muted-foreground">({Array.from(metrics).join(", ")})</span>
                    </li>
                  ))}
                  {selectedDocCount === 0 && selectedVitalsDatasetCount === 0 && (
                    <li className="text-muted-foreground">Nothing selected</li>
                  )}
                </ul>
              </div>
              <div className="rounded-md border p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Not shared</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>{notSharedDocCount} other document(s)</li>
                  <li>{Math.max(notSharedMetricCount, 0)} other vital metric selection(s)</li>
                </ul>
              </div>
            </div>

            <Row label="Recipient" value={providerLabel} />
            <Row label="Documents" value={String(selectedDocCount)} />
            <Row label="Vitals" value={selectedMetricCount > 0 ? `${selectedMetricCount} metric(s)` : "None"} />
            <Row label="Direct identifiers" value={directIdentifierCount === 0 ? "None" : `${directIdentifierCount} document(s) at original fidelity`} />
            <Row label="Access" value="Read only" />
            <Row label="AI processing" value="Disabled" />
            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button onClick={() => setStep(4)}>Next: access rules</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>Step 4 — Access rules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Duration</Label>
              <Select value={durationPreset} onValueChange={(v) => v && setDurationPreset(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SHARE_DURATION_PRESETS.map((p) => (
                    <SelectItem key={p.label} value={p.label}>
                      {p.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">Custom date/time</SelectItem>
                </SelectContent>
              </Select>
              {durationPreset === "custom" && (
                <CustomExpiryPicker value={customExpiry} onChange={setCustomExpiry} />
              )}
            </div>
            <div className="space-y-2">
              <Label>Access type</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setOneTime(false)}
                  className={`rounded-md border p-3 text-left text-sm ${!oneTime ? "border-primary bg-secondary/40" : ""}`}
                >
                  <p className="font-medium">Standard temporary access</p>
                  <p className="text-xs text-muted-foreground">Can be opened repeatedly until it expires or is revoked.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setOneTime(true)}
                  className={`rounded-md border p-3 text-left text-sm ${oneTime ? "border-primary bg-secondary/40" : ""}`}
                >
                  <p className="font-medium">One-time access</p>
                  <p className="text-xs text-muted-foreground">Becomes unavailable after its first successful access.</p>
                </button>
              </div>
              {oneTime && (
                <Alert>
                  <AlertDescription>
                    This link becomes unavailable after its first successful access. Expiry still applies as an additional safety limit.
                  </AlertDescription>
                </Alert>
              )}
            </div>
            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => setStep(3)}>
                Back
              </Button>
              <Button onClick={onCreateShare} disabled={busy}>
                {busy ? "Encrypting for share..." : "Create secure share"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b pb-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
