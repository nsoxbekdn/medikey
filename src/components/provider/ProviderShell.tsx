import { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Cross } from "lucide-react";

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
// single-purpose page. Provider identity is intentionally never shown here:
// access is via an anonymous fragment-secret link, so there is no real
// authenticated provider identity to display.
export function ProviderShell({ status, children }: { status?: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Cross className="h-5 w-5" strokeWidth={2.25} />
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight tracking-tight text-primary">MediKey</p>
              <p className="text-xs leading-tight text-muted-foreground-soft">Your health. In your hands.</p>
            </div>
            <div className="mx-2 hidden h-8 w-px bg-border sm:block" />
            <p className="hidden text-sm font-medium text-foreground sm:block">Secure Shared Record</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Read only</Badge>
            {status && <Badge variant={STATUS_VARIANT[status] ?? "outline"}>{STATUS_LABEL[status] ?? status}</Badge>}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
