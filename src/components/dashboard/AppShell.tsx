"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/db/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useVault } from "@/lib/vault/VaultProvider";
import { Lock, LayoutDashboard, FolderLock, Upload, LineChart, Share2, Activity, Settings, ShieldAlert } from "lucide-react";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/vault", label: "Vault", icon: FolderLock },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/vitals", label: "Vitals", icon: LineChart },
  { href: "/shares", label: "Shares", icon: Share2 },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/demo/security", label: "Breach Simulator", icon: ShieldAlert },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { unlocked, lock } = useVault();

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 flex-col border-r bg-sidebar px-4 py-6 md:flex">
        <Link href="/dashboard" className="mb-8 px-2 text-lg font-semibold tracking-tight text-sidebar-foreground">
          MediKey
        </Link>
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="space-y-2 border-t pt-4">
          <div className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5" />
            Vault {unlocked ? "unlocked" : "locked"}
          </div>
          {unlocked && (
            <Button variant="ghost" size="sm" className="w-full justify-start" onClick={lock}>
              Lock vault
            </Button>
          )}
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </aside>
      <div className="flex-1 bg-background">
        <header className="flex items-center justify-between border-b px-4 py-3 md:hidden">
          <span className="font-semibold">MediKey</span>
          <Button variant="ghost" size="sm" onClick={signOut}>
            Sign out
          </Button>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-8 md:px-8">{children}</main>
      </div>
    </div>
  );
}
