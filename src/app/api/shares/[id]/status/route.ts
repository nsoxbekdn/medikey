import { NextRequest, NextResponse } from "next/server";
import { shareIdSchema } from "@/lib/validation/schemas";
import { createSupabaseServiceClient } from "@/lib/db/server";
import { deriveShareStatus } from "@/lib/sharing/status";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/shares/[id]/status">) {
  const { id } = await ctx.params;
  if (!shareIdSchema.safeParse(id).success) return NextResponse.json({ error: "Share not found." }, { status: 404 });
  const supabase = createSupabaseServiceClient();

  const { data: share } = await supabase.from("shares").select("*").eq("id", id).maybeSingle();
  if (!share) return NextResponse.json({ error: "Share not found." }, { status: 404 });

  const status = deriveShareStatus(share);

  const { data: items } = await supabase
    .from("share_items")
    .select("id, document_id, sanitized_artifact_id, vitals_dataset_id, selected_metrics")
    .eq("share_id", id);

  return NextResponse.json({
    shareId: share.id,
    status,
    providerLabel: share.provider_label,
    providerType: share.provider_type,
    providerVerified: share.provider_verified,
    purpose: share.purpose,
    expiresAt: share.expires_at,
    oneTime: share.one_time,
    itemCount: items?.length ?? 0,
    items:
      items?.map((i) => ({
        kind: i.document_id ? "document" : i.sanitized_artifact_id ? "sanitized_document" : "vitals",
        selectedMetrics: i.selected_metrics,
      })) ?? [],
  });
}
