import Link from "next/link";
import { createSupabaseServerClient, getVerifiedUser } from "@/lib/db/server";
import { VitalsDatasetRow } from "@/lib/db/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, ArrowRight, UploadCloud } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";

export default async function VitalsPage() {
  const supabase = await createSupabaseServerClient();
  const user = await getVerifiedUser();
  const { data } = await supabase
    .from("vitals_datasets")
    .select("*")
    .eq("owner_id", user!.id)
    .order("created_at", { ascending: false });
  const datasets = (data as VitalsDatasetRow[] | null) ?? [];

  return (
    <div>
      <PageHeader
        title="Vitals"
        description="Follow changes over time. Datasets are decrypted only in your browser."
        action={
          <div className="flex gap-2">
            <Button variant="secondary" nativeButton={false} render={<Link href="/vitals/timeline">Health Timeline</Link>} />
            <Button nativeButton={false} render={<Link href="/vitals/import"><UploadCloud className="h-4 w-4" />Import vitals</Link>} />
          </div>
        }
      />

      {datasets.length === 0 ? (
        <Card><CardContent className="py-14 text-center"><Activity className="mx-auto h-6 w-6 text-muted-foreground-soft" /><p className="mt-4 text-sm font-medium">No vitals data yet.</p><p className="mt-1 text-sm text-muted-foreground">Import a CSV export from a wearable or clinic.</p></CardContent></Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {datasets.map((d) => (
            <Link key={d.id} href={`/vitals/${d.id}`} className="flex items-center gap-4 border-b border-border-subtle px-6 py-5 last:border-b-0 hover:bg-muted/40">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-soft text-blue"><Activity className="h-[18px] w-[18px]" /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{d.name}</span><span className="mt-0.5 block text-xs text-muted-foreground">{new Date(d.start_at).toLocaleDateString()} – {new Date(d.end_at).toLocaleDateString()}</span></span>
              <ArrowRight className="h-4 w-4 text-muted-foreground-soft" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
