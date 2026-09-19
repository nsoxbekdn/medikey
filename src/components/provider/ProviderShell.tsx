import { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

const STATUS_VARIANT: Record<string, "success" | "warning" | "outline"> = {
  ACTIVE: "success",
  CONSUMED: "warning",
  EXPIRED: "outline",
  REVOKED: "outline",
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  CONSUMED: "One-time used",
  EXPIRED: "Expired",
  REVOKED: "Revoked",
};

// Dedicated provider chrome — deliberately not the patient app shell. No
// sidebar, no patient navigation; a doctor should land on a minimal,
// single-purpose page.
export function ProviderShell({ status, children }: { status?: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <div>
            <p className="text-sm font-semibold tracking-tight text-primary">MediKey</p>
            <p className="text-xs text-muted-foreground">Secure Shared Record</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden sm:inline-flex">
              Read only
            </Badge>
            {status && <Badge variant={STATUS_VARIANT[status] ?? "outline"}>{STATUS_LABEL[status] ?? status}</Badge>}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
