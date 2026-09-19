"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "./Sidebar";

export function AppShell({ userEmail, children }: { userEmail: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen shrink-0 md:block">
        <Sidebar userEmail={userEmail} />
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
          <span className="text-[15px] font-semibold text-primary">MediKey</span>
        </header>
        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
