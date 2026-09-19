import Papa from "papaparse";
import { buildVitalsPoints } from "@/lib/vitals/parse";
import { autoMapHeaders, VitalField } from "@/lib/vitals/normalize";

type Mapping = Partial<Record<VitalField, string>>;
type WorkerRequest =
  | { id: number; type: "parse"; csvBuffer: ArrayBuffer }
  | { id: number; type: "normalize"; mapping: Mapping };

let cachedRows: Record<string, string>[] = [];

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === "parse") {
      const text = new TextDecoder().decode(request.csvBuffer);
      const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
      cachedRows = parsed.data;
      const headers = parsed.meta.fields ?? [];
      self.postMessage({
        id: request.id,
        result: { headers, rowCount: cachedRows.length, mapping: autoMapHeaders(headers) },
      });
      return;
    }

    const points = buildVitalsPoints(cachedRows, request.mapping);
    self.postMessage({ id: request.id, result: { points } });
  } catch (error) {
    self.postMessage({ id: request.id, error: error instanceof Error ? error.message : "CSV processing failed." });
  }
};

export {};
