import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/db/server";
import { VitalsDatasetRow } from "@/lib/db/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function VitalsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data } = await supabase
    .from("vitals_datasets")
    .select("*")
    .eq("owner_id", user!.id)
    .order("created_at", { ascending: false });
  const datasets = (data as VitalsDatasetRow[] | null) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Vitals</h1>
          <p className="text-muted-foreground">Time-series datasets, decrypted only in your browser.</p>
        </div>
        <Button nativeButton={false} render={<Link href="/vitals/import">Import Vitals</Link>} />
      </div>

      {datasets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No vitals datasets yet. Import a CSV export from a wearable or clinic.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {datasets.map((d) => (
            <Link key={d.id} href={`/vitals/${d.id}`}>
              <Card className="transition-colors hover:bg-secondary/40">
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <p className="font-medium">{d.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(d.start_at).toLocaleDateString()} – {new Date(d.end_at).toLocaleDateString()}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
