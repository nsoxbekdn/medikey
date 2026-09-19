import { describe, expect, it } from "vitest";
import { sameAccessItems } from "./access";
import { selectVitalsMetrics } from "./vitals";
import { createShareSchema } from "@/lib/validation/schemas";
import { buildShareUrl } from "./url";

describe("remote sharing boundaries", () => {
  it("uses the supplied deployment origin and keeps the secret in the fragment", () => {
    expect(buildShareUrl("https://medikey.example", "share-id", "secret-value")).toBe(
      "https://medikey.example/share/share-id#secret-value",
    );
  });

  it("includes only selected vitals metrics in the provider plaintext", () => {
    const result = selectVitalsMetrics(
      [{
        timestamp: "2026-09-19T00:00:00.000Z",
        systolic: 122,
        diastolic: 81,
        heartRate: 70,
        glucose: 101,
        spo2: 98,
        weight: 65,
      }],
      ["systolic", "diastolic"],
    );

    expect(result).toEqual([{ timestamp: "2026-09-19T00:00:00.000Z", systolic: 122, diastolic: 81 }]);
    expect(JSON.stringify(result)).not.toMatch(/heartRate|glucose|spo2|weight/);
  });

  it("rejects malformed mixed-target and incomplete vitals items", () => {
    const base = {
      providerLabel: "Demo Doctor",
      providerType: "Clinic",
      purpose: "Review",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      oneTime: false,
    };
    const mixedTarget = createShareSchema.safeParse({
      ...base,
      items: [{
        documentId: "11111111-1111-4111-8111-111111111111",
        sanitizedArtifactId: "22222222-2222-4222-8222-222222222222",
        wrappedAccessKey: "wrapped",
        wrappingIv: "iv",
      }],
    });
    const incompleteVitals = createShareSchema.safeParse({
      ...base,
      items: [{
        vitalsDatasetId: "33333333-3333-4333-8333-333333333333",
        selectedMetrics: ["systolic"],
        wrappedAccessKey: "wrapped",
        wrappingIv: "iv",
      }],
    });
    expect(mixedTarget.success).toBe(false);
    expect(incompleteVitals.success).toBe(false);
  });

  it("returns prepared URLs only when the atomic claim matches exactly", () => {
    const prepared = [{ itemId: "one", storagePath: "patient/blob-1" }];
    expect(sameAccessItems(prepared, [...prepared])).toBe(true);
    expect(sameAccessItems(prepared, [{ itemId: "one", storagePath: "other/blob-1" }])).toBe(false);
    expect(sameAccessItems(prepared, [])).toBe(false);
  });
});
