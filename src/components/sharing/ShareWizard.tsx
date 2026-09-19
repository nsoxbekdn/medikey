"use client";

import { useEffect, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import Link from "next/link";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useVault } from "@/lib/vault/VaultProvider";
import { createSupabaseBrowserClient } from "@/lib/db/client";
import { DocumentRow, SanitizedArtifactRow, VitalsDatasetRow, VitalsPoint } from "@/lib/db/types";
import { unwrapKey } from "@/lib/crypto/key-wrap";
import { aesDecrypt, aesEncrypt, generateAesKey, exportAesKeyRaw } from "@/lib/crypto/aes";
import { bufToBase64, base64ToBuf, bufToUtf8, utf8ToBuf } from "@/lib/crypto/encoding";
import { generateShareSecret } from "@/lib/sharing/secret";
import { buildShareUrl } from "@/lib/sharing/url";
import { SHARE_DURATION_PRESETS } from "@/lib/sharing/status";
import { toast } from "sonner";

const VITAL_METRICS = ["systolic", "diastolic", "heartRate", "glucose", "spo2", "weight"] as const;

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
  const [result, setResult] = useState<{ shareId: string; url: string; qrDataUrl: string; receiptCode: string } | null>(
    null
  );

  useEffect(() => {
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: documents } = await supabase.from("documents").select("*").eq("owner_id", user.id);
      const { data: sanitizedArtifacts } = await supabase.from("sanitized_artifacts").select("*").eq("owner_id", user.id);
      const merged: SelectableDoc[] = (documents ?? []).map((d) => ({
        ...(d as DocumentRow),
        sanitized: (sanitizedArtifacts as SanitizedArtifactRow[] | null)?.find((s) => s.document_id === d.id) ?? null,
      }));
      setDocs(merged);
      const { data: vitalsData } = await supabase.from("vitals_datasets").select("*").eq("owner_id", user.id);
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
    try {
      const { key: shareSecretKey, secretB64Url } = await generateShareSecret();
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");

      const items: Array<{
        documentId?: string;
        sanitizedArtifactId?: string;
        vitalsDatasetId?: string;
        selectedMetrics?: string[];
        wrappedAccessKey: string;
        wrappingIv: string;
        encryptedStoragePath?: string;
        encryptionIv?: string;
      }> = [];

      for (const [docId, mode] of Object.entries(selectedDocs)) {
        const doc = docs.find((d) => d.id === docId);
        if (!doc) continue;
        const { data: wrapper } = await supabase
          .from("document_key_wrappers")
          .select("*")
          .eq("document_id", docId)
          .single();
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

      for (const [datasetId, metrics] of Object.entries(selectedDatasets)) {
        const dataset = datasets.find((d) => d.id === datasetId);
        if (!dataset) continue;
        const datasetKey = await unwrapKey(vault.rootKey, {
          ciphertext: dataset.wrapped_dataset_key,
          iv: dataset.wrapping_iv,
        });
        const { data: blob } = await supabase.storage.from("encrypted-blobs").download(dataset.encrypted_payload_path);
        const bytes = new Uint8Array(await blob!.arrayBuffer());
        const plainBuf = await aesDecrypt(datasetKey, { ciphertext: bufToBase64(bytes), iv: dataset.encryption_iv });
        const points: VitalsPoint[] = JSON.parse(bufToUtf8(plainBuf));

        const metricList = Array.from(metrics);
        const filtered = points.map((p) => {
          const out: VitalsPoint = { timestamp: p.timestamp };
          for (const m of metricList) {
            const key = m as keyof VitalsPoint;
            if (typeof p[key] === "number") (out as unknown as Record<string, number>)[key] = p[key] as number;
          }
          return out;
        });

        const ephemeralKey = await generateAesKey();
        const encrypted = await aesEncrypt(ephemeralKey, utf8ToBuf(JSON.stringify(filtered)));
        const path = `${user.id}/${uuidv4()}`;
        await supabase.storage
          .from("encrypted-blobs")
          .upload(path, base64ToBuf(encrypted.ciphertext) as BlobPart, { contentType: "application/octet-stream" });

        const ephemeralRaw = await exportAesKeyRaw(ephemeralKey);
        const wrapped = await aesEncrypt(shareSecretKey, ephemeralRaw);

        items.push({
          vitalsDatasetId: datasetId,
          selectedMetrics: metricList,
          wrappedAccessKey: wrapped.ciphertext,
          wrappingIv: wrapped.iv,
          encryptedStoragePath: path,
          encryptionIv: encrypted.iv,
        });
      }

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
      const qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 240 });
      setResult({ shareId, url, qrDataUrl, receiptCode });
      toast.success("Secure share created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create share.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Secure share created</CardTitle>
          <CardDescription>Consent receipt {result.receiptCode}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <img src={result.qrDataUrl} alt="Share QR code" className="rounded-md border" />
          <div className="space-y-2">
            <Label>Secure link</Label>
            <Input readOnly value={result.url} onFocus={(e) => e.currentTarget.select()} />
          </div>
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
                      {VITAL_METRICS.map((metric) => (
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
            <CardDescription>MediKey data sharing label</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Recipient" value={providerLabel} />
            <Row label="Data shared" value={`${selectedDocCount} document(s), ${selectedMetricCount} vital metric(s)`} />
            <Row label="Direct personal identifiers" value={directIdentifierCount === 0 ? "None" : `${directIdentifierCount} document(s) at original fidelity`} />
            <Row label="Download permission" value="Not provided by app" />
            <Row label="AI processing" value="Disabled" />
            <Row label="Access mode" value="Read-only" />
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
                <Input type="datetime-local" onChange={(e) => setCustomExpiry(new Date(e.target.value).toISOString())} />
              )}
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={oneTime} onCheckedChange={setOneTime} id="one-time" />
              <Label htmlFor="one-time">One-time access (consumed after first successful retrieval)</Label>
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
