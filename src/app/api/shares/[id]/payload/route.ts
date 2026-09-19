import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/db/server";
import { deriveShareStatus } from "@/lib/sharing/status";

// Provider retrieval. Backend enforces expiry/revocation/one-time-consumed
// here — not just hidden in the UI. Never returns the share secret, the
// fragment key, or an unselected item.
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/shares/[id]/payload">) {
  const { id } = await ctx.params;
  const supabase = createSupabaseServiceClient();

  const { data: share } = await supabase.from("shares").select("*").eq("id", id).maybeSingle();
  if (!share) return NextResponse.json({ error: "Share not found." }, { status: 404 });

  const status = deriveShareStatus(share);
  if (status !== "ACTIVE") {
    return NextResponse.json({ error: `Share is ${status}.`, status }, { status: 403 });
  }

  const { data: items } = await supabase.from("share_items").select("*").eq("share_id", id);
  if (!items) return NextResponse.json({ error: "No items." }, { status: 404 });

  const results = [];
  for (const item of items) {
    let storagePath: string | null = null;
    let encryptionIv: string | null = null;
    let kind: "document" | "sanitized_document" | "vitals" = "vitals";
    let safeMeta: Record<string, unknown> = {};

    if (item.document_id) {
      kind = "document";
      const { data: doc } = await supabase.from("documents").select("*").eq("id", item.document_id).single();
      storagePath = doc.encrypted_storage_path;
      encryptionIv = doc.encryption_iv;
      safeMeta = { title: doc.title_safe, mimeType: doc.mime_type };
    } else if (item.sanitized_artifact_id) {
      kind = "sanitized_document";
      const { data: art } = await supabase
        .from("sanitized_artifacts")
        .select("*")
        .eq("id", item.sanitized_artifact_id)
        .single();
      storagePath = art.encrypted_storage_path;
      encryptionIv = art.encryption_iv;
      safeMeta = { title: "Sanitized report" };
    } else if (item.vitals_dataset_id) {
      kind = "vitals";
      // Vitals items always carry their own filtered, freshly re-encrypted
      // blob on share_items — never the full owner dataset.
      storagePath = item.encrypted_storage_path;
      encryptionIv = item.encryption_iv;
      const { data: ds } = await supabase
        .from("vitals_datasets")
        .select("name")
        .eq("id", item.vitals_dataset_id)
        .single();
      safeMeta = { name: ds?.name, selectedMetrics: item.selected_metrics };
    }

    if (!storagePath || !encryptionIv) continue;

    const { data: blob, error: dlErr } = await supabase.storage.from("encrypted-blobs").download(storagePath);
    if (dlErr || !blob) continue;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const ciphertextB64 = Buffer.from(bytes).toString("base64");

    results.push({
      itemId: item.id,
      kind,
      ciphertext: ciphertextB64,
      iv: encryptionIv,
      wrappedAccessKey: item.wrapped_access_key,
      wrappingIv: item.wrapping_iv,
      meta: safeMeta,
    });
  }

  await supabase.from("access_logs").insert({
    share_id: id,
    event_type: "PAYLOAD_RETRIEVED",
    actor_type: "provider",
    safe_context: { itemCount: results.length },
  });

  return NextResponse.json({ items: results, oneTime: share.one_time });
}
