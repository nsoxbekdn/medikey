import { notFound } from "next/navigation";
import { createSupabaseServerClient, getVerifiedUser } from "@/lib/db/server";
import { ShareRow, AccessLogRow, ConsentReceiptRow } from "@/lib/db/types";
import { deriveShareStatus } from "@/lib/sharing/status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function ShareDetailPage({
  params,
}: {
  params: Promise<{ shareId: string }>;
}) {
  const { shareId } = await params;
  const supabase = await createSupabaseServerClient();
  const user = await getVerifiedUser();

  const { data: share } = await supabase
    .from("shares")
    .select("*")
    .eq("id", shareId)
    .eq("owner_id", user!.id)
    .maybeSingle();
  if (!share) notFound();

  const { data: receipt } = await supabase
    .from("consent_receipts")
    .select("*")
    .eq("share_id", shareId)
    .maybeSingle();

  const { data: logs } = await supabase
    .from("access_logs")
    .select("*")
    .eq("share_id", shareId)
    .order("created_at", { ascending: true });

  const status = deriveShareStatus(share as ShareRow);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{share.provider_label}</h1>
        <p className="text-muted-foreground">{share.purpose}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status</CardTitle>
        </CardHeader>
        <CardContent>
          <Badge variant="outline">{status}</Badge>
        </CardContent>
      </Card>

      {receipt && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Consent receipt</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p className="font-mono">{(receipt as ConsentReceiptRow).receipt_code}</p>
            <p>Created: {new Date(receipt.created_at).toLocaleString()}</p>
            <p>Expires: {new Date(share.expires_at).toLocaleString()}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {(logs as AccessLogRow[] | null)?.length ? (
            <ul className="space-y-2 text-sm">
              {(logs as AccessLogRow[]).map((log) => (
                <li key={log.id} className="flex justify-between border-b pb-2">
                  <span>{log.event_type.replace(/_/g, " ").toLowerCase()}</span>
                  <span className="text-muted-foreground">{new Date(log.created_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
