"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VitalField, needsManualMapping } from "@/lib/vitals/normalize";
import { VitalsPoint } from "@/lib/db/types";
import { useVault } from "@/lib/vault/VaultProvider";
import { generateAesKey, aesEncryptBytes } from "@/lib/crypto/aes";
import { wrapKey } from "@/lib/crypto/key-wrap";
import { utf8ToBuf } from "@/lib/crypto/encoding";
import { createSupabaseBrowserClient } from "@/lib/db/client";
import { toast } from "sonner";

const FIELDS: VitalField[] = ["timestamp", "systolic", "diastolic", "heartRate", "glucose", "spo2", "weight"];

export function VitalsUploadWizard() {
  const router = useRouter();
  const { vault } = useVault();
  const [name, setName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [mapping, setMapping] = useState<Partial<Record<VitalField, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [csvBusy, setCsvBusy] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const nextRequestId = useRef(0);
  const pending = useRef(new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>());

  useEffect(() => {
    const pendingRequests = pending.current;
    const worker = new Worker(new URL("../../workers/vitals-csv.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
      const request = pendingRequests.get(event.data.id);
      if (!request) return;
      pendingRequests.delete(event.data.id);
      if (event.data.error) request.reject(new Error(event.data.error));
      else request.resolve(event.data.result);
    };
    worker.onerror = () => {
      for (const request of pendingRequests.values()) request.reject(new Error("CSV worker failed."));
      pendingRequests.clear();
    };
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
      for (const request of pendingRequests.values()) request.reject(new Error("CSV processing cancelled."));
      pendingRequests.clear();
    };
  }, []);

  function runCsvWorker<T>(message: Record<string, unknown>, transfer: Transferable[] = []): Promise<T> {
    const worker = workerRef.current;
    if (!worker) return Promise.reject(new Error("CSV processor is not ready."));
    const id = ++nextRequestId.current;
    return new Promise<T>((resolve, reject) => {
      pending.current.set(id, { resolve: resolve as (value: unknown) => void, reject });
      worker.postMessage({ ...message, id }, transfer);
    });
  }

  async function onFile(f: File) {
    setError(null);
    setCsvBusy(true);
    try {
      const csvBuffer = await f.arrayBuffer();
      const parsed = await runCsvWorker<{
        headers: string[];
        rowCount: number;
        mapping: Partial<Record<VitalField, string>>;
      }>({ type: "parse", csvBuffer }, [csvBuffer]);
      if (parsed.rowCount === 0) throw new Error("No rows found in this CSV.");
      setHeaders(parsed.headers);
      setRowCount(parsed.rowCount);
      setMapping(parsed.mapping);
      if (!name) setName(f.name.replace(/\.csv$/i, ""));
    } catch (err) {
      setHeaders([]);
      setRowCount(0);
      setError(err instanceof Error ? err.message : "CSV processing failed.");
    } finally {
      setCsvBusy(false);
    }
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
      const { points } = await runCsvWorker<{ points: VitalsPoint[] }>({ type: "normalize", mapping });
      if (points.length === 0) throw new Error("No valid rows after mapping — check date formats.");

      const datasetKey = await generateAesKey();
      const supabase = createSupabaseBrowserClient();
      // Encryption/wrapping and the session lookup are independent — the
      // session is already held locally by the SDK, so this is not a network
      // call (unlike auth.getUser(), which was one before this change).
      const [encrypted, wrapped, sessionRes] = await Promise.all([
        aesEncryptBytes(datasetKey, utf8ToBuf(JSON.stringify(points))),
        wrapKey(vault.rootKey, datasetKey),
        supabase.auth.getSession(),
      ]);
      const user = sessionRes.data.session?.user;
      if (!user) throw new Error("Not signed in.");

      const path = `${user.id}/${uuidv4()}`;
      const { error: upErr } = await supabase.storage
        .from("encrypted-blobs")
        .upload(path, encrypted.ciphertext as BlobPart, { contentType: "application/octet-stream" });
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
            <Input id="vitals-file" type="file" accept=".csv" disabled={csvBusy} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            {csvBusy && <p className="text-xs text-muted-foreground">Parsing CSV in the background...</p>}
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
            <CardDescription>{rowCount} rows detected. Adjust if auto-mapping looks wrong.</CardDescription>
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
          <Button onClick={onSave} disabled={busy || csvBusy}>
            {busy ? "Encrypting..." : "Encrypt & save dataset"}
          </Button>
        </div>
      )}
    </div>
  );
}
