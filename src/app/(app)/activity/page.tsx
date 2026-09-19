import { createSupabaseServerClient, getVerifiedUser } from "@/lib/db/server";
import { ShareRow, AccessLogRow } from "@/lib/db/types";
import { PageHeader } from "@/components/layout/PageHeader";

export default async function ActivityPage() {
  const supabase = await createSupabaseServerClient();
  const user = await getVerifiedUser();
  const { data: shares } = await supabase.from("shares").select("id, provider_label").eq("owner_id", user!.id);
  const shareIds = (shares as ShareRow[] | null)?.map((s) => s.id) ?? [];

  let logs: AccessLogRow[] = [];
  if (shareIds.length) {
    const { data } = await supabase
      .from("access_logs")
      .select("*")
      .in("share_id", shareIds)
      .order("created_at", { ascending: false })
      .limit(100);
    logs = (data as AccessLogRow[] | null) ?? [];
  }

  const labelFor = (shareId: string) => shares?.find((s) => s.id === shareId)?.provider_label ?? "Provider";

  return (
    <div>
      <PageHeader title="Activity" description="A private audit trail of share and access events. Keys and medical plaintext are never logged." />
      <section className="rounded-xl border border-border bg-card px-6">
          {logs.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ul className="divide-y divide-border-subtle text-sm">
              {logs.map((log) => (
                <li key={log.id} className="grid gap-1 py-4 sm:grid-cols-[180px_1fr] sm:gap-5">
                  <time className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString()}</time>
                  <span><span className="font-medium">{labelFor(log.share_id)}</span> <span className="text-muted-foreground">{log.event_type.replace(/_/g, " ").toLowerCase()}</span></span>
                </li>
              ))}
            </ul>
          )}
      </section>
    </div>
  );
}
