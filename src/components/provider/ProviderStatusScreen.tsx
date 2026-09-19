// Shared calm, centered message for every non-active/error terminal state:
// expired, revoked, one-time-consumed, wrong secret, invalid share id. Never
// a scary error page, never exposes internal detail.
export function ProviderStatusScreen({
  title,
  description,
  meta,
}: {
  title: string;
  description: string;
  meta?: string;
}) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      {meta && <p className="mt-4 text-xs text-muted-foreground-soft">{meta}</p>}
    </div>
  );
}
