import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function WorkflowStepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-center gap-2 overflow-x-auto pb-1">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex shrink-0 items-center gap-2">
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold transition-colors duration-150",
                  active && "border-blue bg-blue text-white",
                  done && "border-blue/30 bg-blue-soft text-blue",
                  !active && !done && "border-border bg-card text-muted-foreground-soft",
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : i + 1}
              </span>
              <span
                className={cn(
                  "text-[13.5px] font-medium",
                  active ? "text-blue" : done ? "text-foreground" : "text-muted-foreground-soft",
                )}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && <span className={cn("h-px w-8 md:w-12", done ? "bg-blue/40" : "bg-border")} />}
          </li>
        );
      })}
    </ol>
  );
}
