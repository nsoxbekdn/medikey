"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/db/client";
import { cn } from "@/lib/utils";
import { BrandLogo } from "./BrandLogo";
import {
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  FolderLock,
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
  { href: "/vitals", label: "Vitals", icon: LineChart },
  { href: "/shares", label: "Shares", icon: Share2 },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  userEmail,
  onClose,
  collapsed = false,
  onCollapsedChange,
}: {
  userEmail: string;
  onClose?: () => void;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const initial = userEmail.charAt(0).toUpperCase();
  const displayName = userEmail.split("@")[0].replace(/[._-]+/g, " ");

  return (
    <div
      className={cn(
        "relative flex h-full flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out",
        collapsed ? "w-[72px]" : "w-[240px]",
      )}
    >
      <div className={cn("flex h-[94px] items-center", collapsed ? "justify-center px-3" : "justify-between px-6")}>
        <BrandLogo href="/dashboard" showTagline={!collapsed} className={collapsed ? "justify-center" : undefined} />
        {onClose && (
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted md:hidden" aria-label="Close menu">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {onCollapsedChange && (
        <button
          type="button"
          onClick={() => onCollapsedChange(!collapsed)}
          className="absolute -right-3 top-[104px] z-10 flex h-6 w-6 items-center justify-center rounded-full border border-sidebar-border bg-card text-muted-foreground shadow-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      )}

      <nav className={cn("flex flex-1 flex-col gap-2 pt-7", collapsed ? "px-2.5" : "px-3.5")} aria-label="Primary navigation">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              title={collapsed ? item.label : undefined}
              aria-label={collapsed ? item.label : undefined}
              className={cn(
                "group relative flex h-12 items-center rounded-lg text-[15px] font-medium transition-colors duration-150",
                collapsed ? "justify-center px-0" : "gap-4 px-4",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className={cn("h-[18px] w-[18px]", active ? "text-blue" : "text-muted-foreground-soft")} strokeWidth={1.75} />
              {!collapsed && <span>{item.label}</span>}
              {collapsed && <span role="tooltip" className="pointer-events-none absolute left-full z-20 ml-3 whitespace-nowrap rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs font-medium text-popover-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className={cn("border-t border-sidebar-border py-3", collapsed ? "px-2.5" : "px-3")}>
        <div className={cn("mt-1 flex items-center rounded-md py-2", collapsed ? "justify-center px-0" : "gap-2.5 px-2.5")} title={collapsed ? displayName : undefined}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-[13px] font-semibold text-primary">
            {initial}
          </div>
          {!collapsed && <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium capitalize text-foreground">{displayName}</div>
            <div className="text-xs text-muted-foreground">Patient</div>
          </div>}
          {!collapsed && <button onClick={signOut} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Sign out" title="Sign out">
            <LogOut className="h-4 w-4" strokeWidth={1.75} />
          </button>}
        </div>
      </div>
    </div>
  );
}
