import { NextRequest, NextResponse } from "next/server";
import { shareIdSchema } from "@/lib/validation/schemas";
import { createSupabaseServiceClient } from "@/lib/db/server";

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
    return NextResponse.json({ error: "Share not found." }, { status: 404, headers: noStoreHeaders });
  }

  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase.rpc("claim_share_access", { p_share_id: id });
  if (error) {
    console.error("claim_share_access failed", error.message);
    return NextResponse.json({ error: "Could not open this share." }, { status: 500, headers: noStoreHeaders });
  }
  if (!data) return NextResponse.json({ error: "Share not found." }, { status: 404, headers: noStoreHeaders });

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
  const items = access.items.map((accessItem, index) => ({
    itemId: accessItem.itemId,
    kind: accessItem.kind,
    iv: accessItem.iv,
    wrappedAccessKey: accessItem.wrappedAccessKey,
    wrappingIv: accessItem.wrappingIv,
    meta: accessItem.meta,
    ciphertextUrl: signedUrlByPath.get(accessItem.storagePath) ?? signed[index].signedUrl,
  }));

  return NextResponse.json(
    { ...access, items, signedUrlExpiresIn: SIGNED_URL_TTL_SECONDS },
    { headers: noStoreHeaders },
  );
}
