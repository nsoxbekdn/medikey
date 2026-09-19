import Link from "next/link";
import { createSupabaseServerClient, getVerifiedUser } from "@/lib/db/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { deriveShareStatus } from "@/lib/sharing/status";
import { ShareRow, DocumentRow, AccessLogRow } from "@/lib/db/types";
import { formatDistanceToNow } from "date-fns";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const user = await getVerifiedUser();

  const [{ data: documents }, { data: shares }, { count: sanitizedCount }] = await Promise.all([
    supabase
      .from("documents")
      .select("*")
      .eq("owner_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("shares").select("*").eq("owner_id", user!.id),
    supabase
      .from("sanitized_artifacts")
      .select("*", { count: "exact", head: true })
      .eq("owner_id", user!.id),
  ]);

  const activeShares = ((shares as ShareRow[] | null) ?? []).filter((s) => deriveShareStatus(s) === "ACTIVE");
  const recentDocs = (documents as DocumentRow[] | null) ?? [];

  let recentAccess: (AccessLogRow & { shares: { provider_label: string } | null })[] = [];
  if ((shares as ShareRow[] | null)?.length) {
    const shareIds = (shares as ShareRow[]).map((s) => s.id);
    const { data } = await supabase
      .from("access_logs")
      .select("*, shares(provider_label)")
      .in("share_id", shareIds)
      .order("created_at", { ascending: false })
      .limit(5);
    recentAccess = (data as typeof recentAccess) ?? [];
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">MediKey</h1>
        <p className="text-muted-foreground">Your records. Your keys. Your control.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Records encrypted</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{documents?.length ?? 0}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active shares</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{activeShares.length}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Sanitized artifacts</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-semibold">{sanitizedCount ?? 0}</CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button nativeButton={false} render={<Link href="/upload">Upload Record</Link>} />
        <Button variant="secondary" nativeButton={false} render={<Link href="/vitals">Import Vitals</Link>} />
        <Button variant="secondary" nativeButton={false} render={<Link href="/shares/new">Create Secure Share</Link>} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent records</CardTitle>
        </CardHeader>
        <CardContent>
          {recentDocs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No records yet. Upload your first medical document.</p>
          ) : (
            <ul className="divide-y">
              {recentDocs.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between py-2 text-sm">
                  <Link href={`/vault/${doc.id}`} className="font-medium hover:underline">
                    {doc.title_safe}
                  </Link>
                  <span className="text-muted-foreground">{new Date(doc.created_at).toLocaleDateString()}</span>
                  <span className="text-xs text-emerald-600">Encrypted</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent access</CardTitle>
        </CardHeader>
        <CardContent>
          {recentAccess.length === 0 ? (
            <p className="text-sm text-muted-foreground">No provider activity yet.</p>
          ) : (
            <ul className="divide-y">
              {recentAccess.map((log) => (
                <li key={log.id} className="py-2 text-sm">
                  <span className="font-medium">{log.shares?.provider_label ?? "Provider"}</span>{" "}
                  <span className="text-muted-foreground">
                    {log.event_type.replace(/_/g, " ").toLowerCase()} — {formatDistanceToNow(new Date(log.created_at))} ago
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
