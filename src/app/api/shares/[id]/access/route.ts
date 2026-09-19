import { NextRequest, NextResponse } from "next/server";
import { shareIdSchema } from "@/lib/validation/schemas";
import { createSupabaseServiceClient } from "@/lib/db/server";
import { sameAccessItems } from "@/lib/sharing/access";

const SIGNED_URL_TTL_SECONDS = 45;

type AccessItem = {
  itemId: string;
  kind: "document" | "sanitized_document" | "vitals";
  storagePath: string;
  iv: string;
  wrappedAccessKey: string;
  wrappingIv: string;
  meta: Record<string, unknown>;
};

type AccessResult = {
  shareId: string;
  status: "ACTIVE" | "REVOKED" | "EXPIRED" | "CONSUMED";
  providerLabel: string;
  providerType: string;
  providerVerified: boolean;
  purpose: string;
  expiresAt: string;
  oneTime: boolean;
  itemCount: number;
  items: AccessItem[];
};

const noStoreHeaders = { "Cache-Control": "no-store, max-age=0" };

// One database RPC validates the share, atomically claims one-time access,
// returns every item in bulk, and records safe access events. Ciphertext then
// travels directly from private Storage to the provider via 45-second URLs.
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!shareIdSchema.safeParse(id).success) {
    return NextResponse.json({ error: "Shared record unavailable." }, { status: 404, headers: noStoreHeaders });
  }

  const supabase = createSupabaseServiceClient();
  // Prepare first so a transient Storage signing failure cannot burn a
  // one-time share. This RPC does not consume or log the share.
  const { data, error } = await supabase.rpc("prepare_share_access", { p_share_id: id });
  if (error) {
    console.error("prepare_share_access failed", error.message);
    return NextResponse.json({ error: "Could not open this share." }, { status: 500, headers: noStoreHeaders });
  }
  if (!data) return NextResponse.json({ error: "Shared record unavailable." }, { status: 404, headers: noStoreHeaders });

  const access = data as AccessResult;
  if (access.status !== "ACTIVE") {
    return NextResponse.json(
      { ...access, items: [], error: `Share is ${access.status}.` },
      { status: 403, headers: noStoreHeaders },
    );
  }

  if (access.items.some((item) => !item.storagePath || !item.iv)) {
    return NextResponse.json({ error: "Shared record metadata is incomplete." }, { status: 500, headers: noStoreHeaders });
  }

  const paths = access.items.map((item) => item.storagePath);
  const { data: signed, error: signedError } = await supabase.storage
    .from("encrypted-blobs")
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  if (signedError || !signed || signed.length !== paths.length || signed.some((entry) => !entry.signedUrl || entry.error)) {
    console.error("Provider signed URL batch failed", signedError?.message ?? "missing signed URL");
    return NextResponse.json({ error: "Could not prepare shared records." }, { status: 502, headers: noStoreHeaders });
  }

  const signedUrlByPath = new Map(signed.map((entry) => [entry.path, entry.signedUrl]));

  // Claim only after all signed URLs are ready. The row lock inside the RPC
  // makes this the single winner for a one-time share and re-checks revocation
  // and expiry against authoritative timestamps.
  const { data: claimedData, error: claimError } = await supabase.rpc("claim_share_access", { p_share_id: id });
  if (claimError || !claimedData) {
    console.error("claim_share_access failed", claimError?.message ?? "missing result");
    return NextResponse.json({ error: "Could not open this share." }, { status: 500, headers: noStoreHeaders });
  }
  const claimed = claimedData as AccessResult;
  if (claimed.status !== "ACTIVE") {
    return NextResponse.json(
      { ...claimed, items: [], error: `Share is ${claimed.status}.` },
      { status: 403, headers: noStoreHeaders },
    );
  }
  if (!sameAccessItems(access.items, claimed.items)) {
    return NextResponse.json({ error: "Shared record changed during access." }, { status: 409, headers: noStoreHeaders });
  }
  const items = claimed.items.map((accessItem, index) => ({
    itemId: accessItem.itemId,
    kind: accessItem.kind,
    iv: accessItem.iv,
    wrappedAccessKey: accessItem.wrappedAccessKey,
    wrappingIv: accessItem.wrappingIv,
    meta: accessItem.meta,
    ciphertextUrl: signedUrlByPath.get(accessItem.storagePath) ?? signed[index].signedUrl,
  }));

  return NextResponse.json(
    { ...claimed, items, signedUrlExpiresIn: SIGNED_URL_TTL_SECONDS },
    { headers: noStoreHeaders },
  );
}
