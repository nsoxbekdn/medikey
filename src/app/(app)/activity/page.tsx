import { createSupabaseServerClient, getVerifiedUser } from "@/lib/db/server";
import { ShareRow, AccessLogRow } from "@/lib/db/types";
import { Card, CardContent } from "@/components/ui/card";

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Activity</h1>
        <p className="text-muted-foreground">Audit trail of share and access events. No keys or plaintext are ever logged.</p>
      </div>
      <Card>
        <CardContent className="py-4">
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {logs.map((log) => (
                <li key={log.id} className="flex justify-between border-b pb-2">
                  <span>
                    <span className="font-medium">{labelFor(log.share_id)}</span>{" "}
                    {log.event_type.replace(/_/g, " ").toLowerCase()}
                  </span>
                  <span className="text-muted-foreground">{new Date(log.created_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
