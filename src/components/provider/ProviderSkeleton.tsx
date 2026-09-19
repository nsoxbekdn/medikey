function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

// Structured skeleton so the portal reads as "loading normally" rather than a
// blank page + spinner — same section shape as the real active view.
export function ProviderSkeleton() {
  return (
    <div className="space-y-6" aria-label="Opening secure share">
      <div className="space-y-2">
        <Bar className="h-6 w-64" />
        <Bar className="h-4 w-80" />
        <Bar className="h-5 w-40" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="rounded-xl border border-border bg-card p-6">
          <Bar className="mb-4 h-5 w-40" />
          <Bar className="h-72 w-full" />
        </div>
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-5">
            <Bar className="mb-3 h-4 w-32" />
            <Bar className="h-16 w-full" />
          </div>
          <div className="rounded-xl border border-border bg-card p-5">
            <Bar className="mb-3 h-4 w-28" />
            <Bar className="h-20 w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}
