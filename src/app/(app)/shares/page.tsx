import Link from "next/link";
import { createSupabaseServerClient, getVerifiedUser } from "@/lib/db/server";
import { ShareRow } from "@/lib/db/types";
import { Button } from "@/components/ui/button";
import { SharesList } from "@/components/sharing/SharesList";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";

export default async function SharesPage() {
  const renderedAt = new Date().toISOString();
  const supabase = await createSupabaseServerClient();
  const user = await getVerifiedUser();
  const { data } = await supabase
    .from("shares")
    .select("*")
    .eq("owner_id", user!.id)
    .order("created_at", { ascending: false });

  return (
    <div>
      <PageHeader title="Shares" description="Review and manage provider access to your records." action={<Button nativeButton={false} render={<Link href="/shares/new"><Plus className="h-4 w-4" />Create secure share</Link>} />} />
      <SharesList shares={(data as ShareRow[] | null) ?? []} renderedAt={renderedAt} />
    </div>
  );
}
