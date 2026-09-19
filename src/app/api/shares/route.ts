import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/db/server";
import { createShareSchema } from "@/lib/validation/schemas";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await request.json();
  const parsed = createShareSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid share request.", details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const { data: share, error: shareErr } = await supabase
    .from("shares")
    .insert({
      owner_id: user.id,
      provider_label: input.providerLabel,
      provider_type: input.providerType,
      provider_verified: false,
      purpose: input.purpose,
      expires_at: input.expiresAt,
      one_time: input.oneTime,
      status: "ACTIVE",
    })
    .select()
    .single();
  if (shareErr || !share) {
    return NextResponse.json({ error: "Failed to create share." }, { status: 500 });
  }

  const itemsPayload = input.items.map((item) => ({
    share_id: share.id,
    document_id: item.documentId ?? null,
    sanitized_artifact_id: item.sanitizedArtifactId ?? null,
    vitals_dataset_id: item.vitalsDatasetId ?? null,
    selected_metrics: item.selectedMetrics ?? null,
    wrapped_access_key: item.wrappedAccessKey,
    wrapping_iv: item.wrappingIv,
    encrypted_storage_path: item.encryptedStoragePath ?? null,
    encryption_iv: item.encryptionIv ?? null,
  }));

  const { error: itemsErr } = await supabase.from("share_items").insert(itemsPayload);
  if (itemsErr) {
    return NextResponse.json({ error: "Failed to save share items." }, { status: 500 });
  }

  const receiptCode = `CNST-${uuidv4().slice(0, 8).toUpperCase()}`;
  await supabase.from("consent_receipts").insert({
    share_id: share.id,
    owner_id: user.id,
    receipt_code: receiptCode,
    safe_summary: {
      providerLabel: input.providerLabel,
      purpose: input.purpose,
      itemCount: input.items.length,
      expiresAt: input.expiresAt,
      oneTime: input.oneTime,
    },
  });

  const serviceClient = createSupabaseServiceClient();
  await serviceClient.from("access_logs").insert({
    share_id: share.id,
    event_type: "SHARE_CREATED",
    actor_type: "patient",
    safe_context: { providerLabel: input.providerLabel },
  });

  return NextResponse.json({ shareId: share.id, receiptCode });
}
