import { NextRequest, NextResponse } from "next/server";
import { shareIdSchema } from "@/lib/validation/schemas";
import { createSupabaseServerClient, createSupabaseServiceClient, getVerifiedUser } from "@/lib/db/server";
import { revokeOwnedShare } from "@/lib/sharing/revoke";

export async function POST(_request: NextRequest, ctx: RouteContext<"/api/shares/[id]/revoke">) {
  const { id } = await ctx.params;
  if (!shareIdSchema.safeParse(id).success) return NextResponse.json({ error: "Share not found." }, { status: 404 });
  const supabase = await createSupabaseServerClient();
  const user = await getVerifiedUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const revokedAt = new Date().toISOString();
  const result = await revokeOwnedShare({
    shareId: id,
    ownerId: user.id,
    revokedAt,
    updateOwnedShare: async ({ shareId, ownerId, revokedAt: confirmedRevokedAt }) => {
      const { data, error } = await supabase
        .from("shares")
        .update({ revoked_at: confirmedRevokedAt, status: "REVOKED" })
        .eq("id", shareId)
        .eq("owner_id", ownerId)
        .select("id")
        .maybeSingle();
      return { data, error };
    },
  });

  if (result.outcome === "failed") {
    console.error("Share revocation failed", result.message);
    return NextResponse.json({ error: "Could not revoke share." }, { status: 500 });
  }
  if (result.outcome === "not_found") {
    return NextResponse.json({ error: "Share not found." }, { status: 404 });
  }

  const serviceClient = createSupabaseServiceClient();
  const { error: logError } = await serviceClient.from("access_logs").insert({
    share_id: id,
    event_type: "SHARE_REVOKED",
    actor_type: "patient",
    safe_context: {},
  });
  if (logError) console.error("Share revocation audit log failed", logError.message);

  return NextResponse.json({ ok: true });
}
