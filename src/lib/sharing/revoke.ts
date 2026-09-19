export interface RevokeUpdateResult {
  data: { id: string } | null;
  error: { message: string } | null;
}

interface RevokeOwnedShareInput {
  shareId: string;
  ownerId: string;
  revokedAt: string;
  updateOwnedShare: (input: {
    shareId: string;
    ownerId: string;
    revokedAt: string;
  }) => Promise<RevokeUpdateResult>;
}

export type RevokeOwnedShareResult =
  | { outcome: "revoked" }
  | { outcome: "not_found" }
  | { outcome: "failed"; message: string };

export async function revokeOwnedShare({
  shareId,
  ownerId,
  revokedAt,
  updateOwnedShare,
}: RevokeOwnedShareInput): Promise<RevokeOwnedShareResult> {
  const { data, error } = await updateOwnedShare({ shareId, ownerId, revokedAt });

  if (error) return { outcome: "failed", message: error.message };
  if (!data || data.id !== shareId) return { outcome: "not_found" };
  return { outcome: "revoked" };
}
