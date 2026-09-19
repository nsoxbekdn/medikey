import Link from "next/link";
import { cn } from "@/lib/utils";

export function BrandLogo({
  href = "/",
  compact = false,
  showTagline = false,
  className,
}: {
  href?: string;
  compact?: boolean;
  showTagline?: boolean;
  className?: string;
}) {
  return (
    <Link href={href} className={cn("flex min-w-0 items-center gap-2.5", className)} aria-label="MediKey home">
      <span className="relative block h-7 w-7 shrink-0" aria-hidden="true">
        <span className="absolute left-0 top-[7px] h-3.5 w-3.5 rounded-[5px] bg-[#1559ad]" />
        <span className="absolute left-[7px] top-0 h-3.5 w-3.5 rounded-[5px] bg-[#0a438f]" />
        <span className="absolute bottom-0 left-[7px] h-3.5 w-3.5 rounded-[5px] bg-[#2b86c2]" />
        <span className="absolute right-0 top-[7px] h-3.5 w-3.5 rounded-[5px] bg-[#1f9e9b]" />
      </span>
      <span className="min-w-0">
        <span className={cn("block font-semibold tracking-[-0.03em] text-[#071a37]", compact ? "text-[16px]" : "text-[18px]")}>MediKey</span>
        {showTagline && <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">Your health. In your hands.</span>}
      </span>
    </Link>
  );
}
