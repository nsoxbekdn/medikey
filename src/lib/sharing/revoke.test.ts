import { describe, expect, it, vi } from "vitest";
import { revokeOwnedShare } from "./revoke";

const shareId = "11111111-1111-4111-8111-111111111111";
const ownerId = "22222222-2222-4222-8222-222222222222";
const revokedAt = "2026-09-19T18:30:00.000Z";

describe("owner-bound share revocation", () => {
  it("reports success only when the expected share row was returned", async () => {
    const updateOwnedShare = vi.fn().mockResolvedValue({ data: { id: shareId }, error: null });

    await expect(revokeOwnedShare({ shareId, ownerId, revokedAt, updateOwnedShare })).resolves.toEqual({
      outcome: "revoked",
    });
    expect(updateOwnedShare).toHaveBeenCalledWith({ shareId, ownerId, revokedAt });
  });

  it("returns failure when the database update fails", async () => {
    const updateOwnedShare = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "database unavailable" },
    });

    await expect(revokeOwnedShare({ shareId, ownerId, revokedAt, updateOwnedShare })).resolves.toEqual({
      outcome: "failed",
      message: "database unavailable",
    });
  });

  it("preserves owner isolation by treating an unmatched row as not found", async () => {
    const updateOwnedShare = vi.fn().mockImplementation(async (input) => {
      expect(input.ownerId).toBe(ownerId);
      return { data: null, error: null };
    });

    await expect(revokeOwnedShare({ shareId, ownerId, revokedAt, updateOwnedShare })).resolves.toEqual({
      outcome: "not_found",
    });
  });
});
