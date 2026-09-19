"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShareRow } from "@/lib/db/types";
import { deriveShareStatus, isRetrievable } from "@/lib/sharing/status";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDistanceToNowStrict } from "date-fns";

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  REVOKED: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  EXPIRED: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  CONSUMED: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
};

export function SharesList({ shares }: { shares: ShareRow[] }) {
  const router = useRouter();
  const [revoking, setRevoking] = useState<string | null>(null);

  async function onRevoke(id: string) {
    setRevoking(id);
    await fetch(`/api/shares/${id}/revoke`, { method: "POST" });
    setRevoking(null);
    router.refresh();
  }

  if (shares.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No shares yet. Create one from the vault or vitals page.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3">
      {shares.map((share) => {
        const status = deriveShareStatus(share);
        return (
          <Card key={share.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <p className="font-medium">{share.provider_label}</p>
                <p className="text-xs text-muted-foreground">{share.purpose}</p>
                {status === "ACTIVE" && (
                  <p className="text-xs text-muted-foreground">
                    Expires in {formatDistanceToNowStrict(new Date(share.expires_at))}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="outline" className={STATUS_STYLES[status]}>
                  {status}
                </Badge>
                {isRetrievable(status) && (
                  <Button size="sm" variant="destructive" onClick={() => onRevoke(share.id)} disabled={revoking === share.id}>
                    Revoke Access
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
