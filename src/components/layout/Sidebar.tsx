"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/db/client";
import { cn } from "@/lib/utils";
import { useVault } from "@/lib/vault/VaultProvider";
import {
  Lock,
  LockOpen,
  LayoutDashboard,
  FolderLock,
  Upload,
  LineChart,
  Share2,
  Activity,
  Settings,
  LogOut,
  X,
} from "lucide-react";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/vault", label: "Vault", icon: FolderLock },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/vitals", label: "Vitals", icon: LineChart },
  { href: "/shares", label: "Shares", icon: Share2 },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ userEmail, onClose }: { userEmail: string; onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { unlocked, lock } = useVault();

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const initial = userEmail.charAt(0).toUpperCase();

  return (
    <div className="flex h-full w-[248px] flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-start justify-between px-5 pt-6 pb-5">
        <Link href="/dashboard" className="block">
          <div className="text-[17px] font-semibold tracking-tight text-primary">MediKey</div>
          <div className="mt-0.5 text-xs text-muted-foreground">Your health. In your hands.</div>
        </Link>
        {onClose && (
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted md:hidden" aria-label="Close menu">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-3">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              className={cn(
                "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] font-medium transition-colors duration-150",
                active
                  ? "bg-sidebar-accent text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className={cn("h-[18px] w-[18px]", active ? "text-blue" : "text-muted-foreground-soft")} strokeWidth={1.75} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border px-3 py-3">
        <div className="flex items-start gap-2.5 rounded-md px-2.5 py-2">
          {unlocked ? (
            <LockOpen className="mt-0.5 h-4 w-4 text-success" strokeWidth={1.75} />
          ) : (
            <Lock className="mt-0.5 h-4 w-4 text-muted-foreground-soft" strokeWidth={1.75} />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-foreground">Vault {unlocked ? "unlocked" : "locked"}</div>
            <div className="truncate text-xs text-muted-foreground">Local only · You control your data</div>
          </div>
          {unlocked && (
            <button onClick={lock} className="text-xs font-medium text-blue hover:underline">
              Lock
            </button>
          )}
        </div>

        <div className="mt-1 flex items-center gap-2.5 rounded-md px-2.5 py-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[13px] font-semibold text-primary">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium text-foreground">{userEmail}</div>
            <div className="text-xs text-muted-foreground">Patient</div>
          </div>
          <button onClick={signOut} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Sign out" title="Sign out">
            <LogOut className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </div>
  );
}
