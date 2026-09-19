import { describe, expect, it } from "vitest";
import { parseProviderVitalsPayload } from "./vitals";

describe("parseProviderVitalsPayload", () => {
  it("parses a blood-pressure-only CSV without creating omitted metrics", () => {
    const points = parseProviderVitalsPayload("timestamp,systolic,diastolic\n2026-09-18T10:00:00Z,128,82");

    expect(points).toEqual([{ timestamp: "2026-09-18T10:00:00.000Z", systolic: 128, diastolic: 82 }]);
    expect(points[0]).not.toHaveProperty("heartRate");
    expect(points[0]).not.toHaveProperty("glucose");
    expect(points[0]).not.toHaveProperty("spo2");
    expect(points[0]).not.toHaveProperty("weight");
  });

  it("preserves selective disclosure in JSON payloads", () => {
    const points = parseProviderVitalsPayload(JSON.stringify([
      { timestamp: "2026-09-18T10:00:00Z", systolic: 128, diastolic: 82 },
    ]));

    expect(points[0]).toEqual({ timestamp: "2026-09-18T10:00:00.000Z", systolic: 128, diastolic: 82 });
    expect(Object.keys(points[0])).toEqual(["timestamp", "systolic", "diastolic"]);
  });

  it("sorts readings chronologically for latest-value rendering", () => {
    const points = parseProviderVitalsPayload(JSON.stringify([
      { timestamp: "2026-09-19T10:00:00Z", systolic: 128, diastolic: 82 },
      { timestamp: "2026-09-18T10:00:00Z", systolic: 124, diastolic: 80 },
    ]));

    expect(points.map((point) => point.systolic)).toEqual([124, 128]);
  });
});
