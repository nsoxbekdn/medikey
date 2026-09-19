"use client";

import { useState, useSyncExternalStore } from "react";
import { ChevronDown, Menu, Search } from "lucide-react";
import { Sidebar } from "./Sidebar";

export function AppShell({ userEmail, children }: { userEmail: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const collapsed = useSyncExternalStore(subscribeToSidebarPreference, readSidebarPreference, () => false);

  function updateCollapsed(next: boolean) {
    window.localStorage.setItem("medikey-sidebar-collapsed", String(next));
    window.dispatchEvent(new Event("medikey-sidebar-preference"));
  }
  const displayName = userEmail.split("@")[0].replace(/[._-]+/g, " ");
  const initial = userEmail.charAt(0).toUpperCase();

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen shrink-0 md:block">
        <Sidebar userEmail={userEmail} collapsed={collapsed} onCollapsedChange={updateCollapsed} />
      </aside>

      {/* ponytail: plain fixed drawer instead of a Sheet dependency */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-primary/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 z-50">
            <Sidebar userEmail={userEmail} onClose={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="hidden h-[68px] items-center justify-end gap-8 border-b border-border bg-card px-10 md:flex">
          <div className="relative w-full max-w-[430px]">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input disabled aria-label="Search is not available yet" placeholder="Search your records, categories, or providers..." className="h-10 w-full rounded-lg border border-input bg-background/70 pl-11 pr-4 text-sm text-muted-foreground placeholder:text-muted-foreground/80 disabled:cursor-not-allowed disabled:opacity-100" />
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{initial}</span>
            <span className="max-w-32 truncate text-sm font-medium capitalize text-foreground">{displayName}</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </div>
        </header>
        <header className="flex h-14 items-center gap-3 border-b border-border bg-card px-4 md:hidden">
          <button onClick={() => setOpen(true)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-[15px] font-semibold text-primary">MediKey</span>
        </header>
        <main className="mx-auto w-full max-w-[1440px] px-5 py-8 md:px-8 md:py-10 xl:px-10">{children}</main>
      </div>
    </div>
  );
}

function subscribeToSidebarPreference(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("medikey-sidebar-preference", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("medikey-sidebar-preference", onStoreChange);
  };
}

function readSidebarPreference() {
  return window.localStorage.getItem("medikey-sidebar-collapsed") === "true";
}
