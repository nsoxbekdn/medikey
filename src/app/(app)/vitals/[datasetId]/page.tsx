import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/server";
import { VaultUnlockGate } from "@/components/vault/VaultUnlockGate";
import { VitalsDatasetViewer } from "@/components/vitals/VitalsDatasetViewer";
import { VitalsDatasetRow } from "@/lib/db/types";

export default async function VitalsDatasetPage({
  params,
}: {
  params: Promise<{ datasetId: string }>;
}) {
  const { datasetId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data } = await supabase
    .from("vitals_datasets")
    .select("*")
    .eq("id", datasetId)
    .eq("owner_id", user!.id)
    .maybeSingle();
  if (!data) notFound();

  return (
    <VaultUnlockGate>
      <VitalsDatasetViewer dataset={data as VitalsDatasetRow} />
    </VaultUnlockGate>
  );
}
