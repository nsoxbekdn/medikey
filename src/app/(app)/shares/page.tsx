import Link from "next/link";
import { createSupabaseServerClient, getVerifiedUser } from "@/lib/db/server";
import { ShareRow } from "@/lib/db/types";
import { Button } from "@/components/ui/button";
import { SharesList } from "@/components/sharing/SharesList";

export default async function SharesPage() {
  const supabase = await createSupabaseServerClient();
  const user = await getVerifiedUser();
  const { data } = await supabase
    .from("shares")
    .select("*")
    .eq("owner_id", user!.id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Shares</h1>
          <p className="text-muted-foreground">Active, expired, and revoked provider access.</p>
        </div>
        <Button nativeButton={false} render={<Link href="/shares/new">Create Secure Share</Link>} />
      </div>
      <SharesList shares={(data as ShareRow[] | null) ?? []} />
    </div>
  );
}
