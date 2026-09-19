import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient, createSupabaseServiceClient, getVerifiedUser } from "@/lib/db/server";
import { createShareSchema } from "@/lib/validation/schemas";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const user = await getVerifiedUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = createShareSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid share request.", details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  // One authenticated database transaction creates the share, verifies that
  // every referenced record belongs to this patient, inserts all items, and
  // writes the consent receipt. A failure leaves no half-created share.
  const { data: created, error: createError } = await supabase.rpc("create_share_with_items", {
    p_provider_label: input.providerLabel,
    p_provider_type: input.providerType,
    p_purpose: input.purpose,
    p_expires_at: input.expiresAt,
    p_one_time: input.oneTime,
    p_items: input.items,
  });
  if (createError || !created) {
    return NextResponse.json({ error: "Failed to create share." }, { status: 400 });
  }
  const { shareId, receiptCode } = created as { shareId: string; receiptCode: string };

  const serviceClient = createSupabaseServiceClient();
  await serviceClient.from("access_logs").insert({
    share_id: shareId,
    event_type: "SHARE_CREATED",
    actor_type: "patient",
    safe_context: { providerLabel: input.providerLabel },
  });

  return NextResponse.json({ shareId, receiptCode }, { headers: { "Cache-Control": "no-store" } });
}
