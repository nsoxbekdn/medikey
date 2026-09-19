import { NextRequest, NextResponse } from "next/server";
import { shareIdSchema } from "@/lib/validation/schemas";
import { createSupabaseServerClient, createSupabaseServiceClient, getVerifiedUser } from "@/lib/db/server";

export async function POST(_request: NextRequest, ctx: RouteContext<"/api/shares/[id]/revoke">) {
  const { id } = await ctx.params;
  if (!shareIdSchema.safeParse(id).success) return NextResponse.json({ error: "Share not found." }, { status: 404 });
  const supabase = await createSupabaseServerClient();
  const user = await getVerifiedUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const { data: share } = await supabase.from("shares").select("id, owner_id").eq("id", id).maybeSingle();
  if (!share || share.owner_id !== user.id) {
    return NextResponse.json({ error: "Share not found." }, { status: 404 });
  }

  await supabase.from("shares").update({ revoked_at: new Date().toISOString(), status: "REVOKED" }).eq("id", id);

  const serviceClient = createSupabaseServiceClient();
  await serviceClient.from("access_logs").insert({
    share_id: id,
    event_type: "SHARE_REVOKED",
    actor_type: "patient",
    safe_context: {},
  });

  return NextResponse.json({ ok: true });
}
