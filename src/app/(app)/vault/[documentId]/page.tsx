import { notFound } from "next/navigation";
import { createSupabaseServerClient, getVerifiedUser } from "@/lib/db/server";
import { DocumentDetail } from "@/components/documents/DocumentDetail";
import { VaultUnlockGate } from "@/components/vault/VaultUnlockGate";
import { DocumentRow, DocumentKeyWrapperRow, SanitizedArtifactRow } from "@/lib/db/types";

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  const supabase = await createSupabaseServerClient();
  const user = await getVerifiedUser();

  const { data: document } = await supabase
    .from("documents")
    .select("*")
    .eq("id", documentId)
    .eq("owner_id", user!.id)
    .maybeSingle();
  if (!document) notFound();

  const { data: wrapper } = await supabase
    .from("document_key_wrappers")
    .select("*")
    .eq("document_id", documentId)
    .maybeSingle();
  if (!wrapper) notFound();

  const { data: sanitized } = await supabase
    .from("sanitized_artifacts")
    .select("*")
    .eq("document_id", documentId)
    .maybeSingle();

  return (
    <VaultUnlockGate>
      <DocumentDetail
        document={document as DocumentRow}
        wrapper={wrapper as DocumentKeyWrapperRow}
        sanitized={sanitized as SanitizedArtifactRow | null}
      />
    </VaultUnlockGate>
  );
}
