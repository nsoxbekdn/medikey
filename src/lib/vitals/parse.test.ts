import { describe, expect, it } from "vitest";
import { buildVitalsPoints } from "./parse";

describe("vitals normalization", () => {
  it("sorts by the timestamp parsed once and drops invalid rows", () => {
    const rows = [
      { when: "2026-09-19T12:02:00Z", sys: "122" },
      { when: "not-a-date", sys: "999" },
      { when: "2026-09-19T12:01:00Z", sys: "121" },
    ];
    const points = buildVitalsPoints(rows, { timestamp: "when", systolic: "sys" });

    expect(points).toEqual([
      { timestamp: "2026-09-19T12:01:00.000Z", systolic: 121 },
      { timestamp: "2026-09-19T12:02:00.000Z", systolic: 122 },
    ]);
  });
});
