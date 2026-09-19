import { describe, expect, it } from "vitest";
import { buildTimelineEvents, buildMetricTrends, groupEventsByYear } from "./build";
import { DocumentRow, VitalsPoint } from "@/lib/db/types";

const doc = (id: string, created_at: string, title_safe: string): DocumentRow =>
  ({ id, created_at, title_safe } as DocumentRow);

describe("timeline event derivation", () => {
  const points: VitalsPoint[] = [
    { timestamp: "2024-09-01T00:00:00Z", systolic: 120 },
    { timestamp: "2025-03-11T00:00:00Z", systolic: 128 },
    { timestamp: "2025-07-03T00:00:00Z", systolic: 131 },
    { timestamp: "2026-02-14T00:00:00Z", systolic: 135 },
  ];
  const vitalsSources = [{ datasetId: "d1", datasetName: "Home BP monitor", points }];
  const documents = [doc("doc1", "2025-07-03T00:00:00Z", "Metformin prescription")];

  it("emits one vital event per metric per calendar year, using that year's latest reading", () => {
    const events = buildTimelineEvents(documents, vitalsSources);
    const systolicEvents = events.filter((e) => e.title === "Systolic BP");
    expect(systolicEvents).toHaveLength(3);
    // 2025 has two readings — the later one (131) must win, never 128.
    const y2025 = systolicEvents.find((e) => e.date.startsWith("2025"));
    expect(y2025?.value).toBe("131");
  });

  it("never fabricates a source: every event carries a real document or dataset id", () => {
    const events = buildTimelineEvents(documents, vitalsSources);
    for (const event of events) {
      expect(event.sourceId).toBeTruthy();
      expect(event.confidence).toBe("confirmed");
    }
  });

  it("groups events by year in ascending order", () => {
    const events = buildTimelineEvents(documents, vitalsSources);
    const grouped = groupEventsByYear(events);
    const years = grouped.map(([year]) => year);
    expect(years).toEqual([...years].sort((a, b) => a - b));
  });

  it("builds a metric trend only when at least two readings exist", () => {
    const trends = buildMetricTrends(vitalsSources);
    const systolic = trends.find((t) => t.metric === "systolic");
    expect(systolic?.values).toHaveLength(4);
    expect(trends.find((t) => t.metric === "weight")).toBeUndefined();
  });
});
