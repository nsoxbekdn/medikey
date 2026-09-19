"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseVitalsCsv, buildVitalsPoints } from "@/lib/vitals/parse";
import { VitalField, needsManualMapping } from "@/lib/vitals/normalize";
import { useVault } from "@/lib/vault/VaultProvider";
import { generateAesKey, aesEncrypt } from "@/lib/crypto/aes";
import { wrapKey } from "@/lib/crypto/key-wrap";
import { utf8ToBuf, base64ToBuf } from "@/lib/crypto/encoding";
import { createSupabaseBrowserClient } from "@/lib/db/client";
import { toast } from "sonner";

const FIELDS: VitalField[] = ["timestamp", "systolic", "diastolic", "heartRate", "glucose", "spo2", "weight"];

export function VitalsUploadWizard() {
  const router = useRouter();
  const { vault } = useVault();
  const [name, setName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Partial<Record<VitalField, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(f: File) {
    setError(null);
    const text = await f.text();
    const parsed = parseVitalsCsv(text);
    if (parsed.rows.length === 0) {
      setError("No rows found in this CSV.");
      return;
    }
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setMapping(parsed.mapping);
    if (!name) setName(f.name.replace(/\.csv$/i, ""));
  }

  async function onSave() {
    if (!vault) return;
    if (needsManualMapping(mapping)) {
      setError("Map a timestamp column before saving.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const points = buildVitalsPoints(rows, mapping);
      if (points.length === 0) throw new Error("No valid rows after mapping — check date formats.");

      const datasetKey = await generateAesKey();
      const encrypted = await aesEncrypt(datasetKey, utf8ToBuf(JSON.stringify(points)));
      const wrapped = await wrapKey(vault.rootKey, datasetKey);

      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in.");

      const path = `${user.id}/${uuidv4()}`;
      const { error: upErr } = await supabase.storage
        .from("encrypted-blobs")
        .upload(path, base64ToBuf(encrypted.ciphertext) as BlobPart, { contentType: "application/octet-stream" });
      if (upErr) throw upErr;

      const { data: row, error: insErr } = await supabase
        .from("vitals_datasets")
        .insert({
          owner_id: user.id,
          name,
          source_type: "csv",
          encrypted_payload_path: path,
          encryption_iv: encrypted.iv,
          wrapped_dataset_key: wrapped.ciphertext,
          wrapping_iv: wrapped.iv,
          schema_version: 1,
          start_at: points[0].timestamp,
          end_at: points[points.length - 1].timestamp,
        })
        .select()
        .single();
      if (insErr || !row) throw insErr ?? new Error("Failed to save dataset.");

      toast.success("Vitals imported.");
      router.push(`/vitals/${row.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Import vitals CSV</CardTitle>
          <CardDescription>Parsed locally in this browser. Encrypted before it ever leaves it.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="vitals-file">CSV file</Label>
            <Input id="vitals-file" type="file" accept=".csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </div>
          {headers.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="dataset-name">Dataset name</Label>
              <Input id="dataset-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
        </CardContent>
      </Card>

      {headers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Column mapping</CardTitle>
            <CardDescription>{rows.length} rows detected. Adjust if auto-mapping looks wrong.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map((field) => (
              <div key={field} className="space-y-1">
                <Label className="text-xs uppercase text-muted-foreground">{field}</Label>
                <Select
                  value={mapping[field] ?? "__none__"}
                  onValueChange={(v) => setMapping((m) => ({ ...m, [field]: v === "__none__" ? undefined : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Not mapped" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Not mapped</SelectItem>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {headers.length > 0 && (
        <div className="flex justify-end">
          <Button onClick={onSave} disabled={busy}>
            {busy ? "Encrypting..." : "Encrypt & save dataset"}
          </Button>
        </div>
      )}
    </div>
  );
}
