import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/db/server";
import { accessEventSchema, shareIdSchema } from "@/lib/validation/schemas";

// Safe, non-secret access events only. Never accepts or logs keys/plaintext.
export async function POST(request: NextRequest, ctx: RouteContext<"/api/shares/[id]/event">) {
  const { id } = await ctx.params;
  if (!shareIdSchema.safeParse(id).success) return NextResponse.json({ error: "Share not found." }, { status: 404 });
  const body = await request.json().catch(() => null);
  const parsed = accessEventSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid event." }, { status: 400 });

  const supabase = createSupabaseServiceClient();
  const { data: share } = await supabase.from("shares").select("id").eq("id", id).maybeSingle();
  if (!share) return NextResponse.json({ error: "Share not found." }, { status: 404 });

  await supabase.from("access_logs").insert({
    share_id: id,
    event_type: parsed.data.eventType,
    actor_type: parsed.data.actorType,
    safe_context: {},
  });

  return NextResponse.json({ ok: true });
}
