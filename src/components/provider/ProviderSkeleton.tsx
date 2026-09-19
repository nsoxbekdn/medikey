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
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Bar className="h-10" />
          <Bar className="h-10" />
          <Bar className="h-10" />
          <Bar className="h-10" />
        </div>
      </div>
      <div className="rounded-lg border border-border bg-card p-6">
        <Bar className="mb-4 h-5 w-40" />
        <Bar className="h-64 w-full" />
      </div>
    </div>
  );
}
