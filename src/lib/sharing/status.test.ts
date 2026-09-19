import { describe, it, expect } from "vitest";
import { deriveShareStatus } from "./status";

const now = new Date("2026-09-19T12:00:00Z");
const future = "2026-09-20T12:00:00Z";
const past = "2026-09-18T12:00:00Z";

describe("share state machine (§39)", () => {
  it("ACTIVE when unrevoked, unconsumed and before expiry", () => {
    expect(deriveShareStatus({ revoked_at: null, one_time: false, consumed_at: null, expires_at: future }, now)).toBe("ACTIVE");
  });
  it("EXPIRED once past expires_at, regardless of any status column", () => {
    expect(deriveShareStatus({ revoked_at: null, one_time: false, consumed_at: null, expires_at: past }, now)).toBe("EXPIRED");
  });
  it("REVOKED wins over everything", () => {
    expect(deriveShareStatus({ revoked_at: past, one_time: true, consumed_at: past, expires_at: future }, now)).toBe("REVOKED");
  });
  it("CONSUMED only when one_time and consumed_at set", () => {
    expect(deriveShareStatus({ revoked_at: null, one_time: true, consumed_at: past, expires_at: future }, now)).toBe("CONSUMED");
    expect(deriveShareStatus({ revoked_at: null, one_time: false, consumed_at: past, expires_at: future }, now)).toBe("ACTIVE");
  });
});
