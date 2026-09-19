"use client";

import { useState, useSyncExternalStore } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { BrandLogo } from "./BrandLogo";

export function AppShell({ userEmail, children }: { userEmail: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const collapsed = useSyncExternalStore(subscribeToSidebarPreference, readSidebarPreference, () => false);

  function updateCollapsed(next: boolean) {
    window.localStorage.setItem("medikey-sidebar-collapsed", String(next));
    window.dispatchEvent(new Event("medikey-sidebar-preference"));
  }
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
        <header className="flex h-14 items-center gap-3 border-b border-border bg-card px-4 md:hidden">
          <button onClick={() => setOpen(true)} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted" aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <BrandLogo href="/dashboard" compact />
        </header>
        <main className="medikey-page-enter mx-auto w-full max-w-[1440px] px-5 py-8 md:px-8 md:py-10 xl:px-10">{children}</main>
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
