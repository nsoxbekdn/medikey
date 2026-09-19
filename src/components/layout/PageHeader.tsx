export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{eyebrow}</div>}
        <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.02em] text-foreground md:text-[32px]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[15px] leading-6 text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
