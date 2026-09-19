import { NextRequest, NextResponse } from "next/server";
import { shareIdSchema } from "@/lib/validation/schemas";
import { createSupabaseServiceClient } from "@/lib/db/server";
import { deriveShareStatus } from "@/lib/sharing/status";

// Marks a one-time share consumed after a successful client-side decryption.
// "One-time" means one successful retrieval session — it cannot prevent
// screenshots or local copies of already-decrypted content.
export async function POST(_request: NextRequest, ctx: RouteContext<"/api/shares/[id]/consume">) {
  const { id } = await ctx.params;
  if (!shareIdSchema.safeParse(id).success) return NextResponse.json({ error: "Share not found." }, { status: 404 });
  const supabase = createSupabaseServiceClient();

  const { data: share } = await supabase.from("shares").select("*").eq("id", id).maybeSingle();
  if (!share) return NextResponse.json({ error: "Share not found." }, { status: 404 });
  if (!share.one_time) return NextResponse.json({ ok: true, note: "Not a one-time share." });

  const status = deriveShareStatus(share);
  if (status !== "ACTIVE") return NextResponse.json({ error: `Share is ${status}.` }, { status: 403 });

  await supabase
    .from("shares")
    .update({ consumed_at: new Date().toISOString(), status: "CONSUMED" })
    .eq("id", id)
    .is("consumed_at", null);

  await supabase.from("access_logs").insert({
    share_id: id,
    event_type: "ONE_TIME_CONSUMED",
    actor_type: "provider",
    safe_context: {},
  });

  return NextResponse.json({ ok: true });
}
