"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShareRow } from "@/lib/db/types";
import { deriveShareStatus, isRetrievable } from "@/lib/sharing/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, formatDistanceStrict } from "date-fns";

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "border-success/25 bg-success-soft text-success-foreground",
  REVOKED: "border-destructive/20 bg-destructive-soft text-destructive",
  EXPIRED: "border-border bg-muted text-muted-foreground",
  CONSUMED: "border-warning/30 bg-warning-soft text-warning-foreground",
};

export function SharesList({ shares, renderedAt }: { shares: ShareRow[]; renderedAt: string }) {
  const router = useRouter();
  const [revoking, setRevoking] = useState<string | null>(null);
  const renderTime = new Date(renderedAt);

  async function onRevoke(id: string) {
    setRevoking(id);
    await fetch(`/api/shares/${id}/revoke`, { method: "POST" });
    setRevoking(null);
    router.refresh();
  }

  if (shares.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center"><p className="text-sm font-medium text-foreground">No secure shares yet.</p><p className="mt-1 text-sm text-muted-foreground">Create a share when a provider needs access to selected records.</p></div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="hidden grid-cols-[1fr_180px_130px_120px] border-b border-border-subtle px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid"><span>Recipient</span><span>Expiry</span><span>Status</span><span className="text-right">Action</span></div>
      {shares.map((share) => {
        const status = deriveShareStatus(share, renderTime);
        return (
          <div key={share.id} className="grid gap-4 border-b border-border-subtle px-6 py-5 last:border-b-0 md:grid-cols-[1fr_180px_130px_120px] md:items-center">
              <div className="min-w-0">
                <p className="font-medium">{share.provider_label}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{share.purpose}</p>
              </div>
              <p className="text-sm text-muted-foreground">{status === "ACTIVE" ? `In ${formatDistanceStrict(renderTime, new Date(share.expires_at))}` : format(new Date(share.expires_at), "dd MMM yyyy")}</p>
              <div>
                <Badge variant="outline" className={STATUS_STYLES[status]}>
                  {status}
                </Badge>
              </div>
              <div className="md:text-right">{isRetrievable(status) && <Button size="sm" variant="outline" onClick={() => onRevoke(share.id)} disabled={revoking === share.id}>Revoke</Button>}</div>
          </div>
        );
      })}
    </div>
  );
}
