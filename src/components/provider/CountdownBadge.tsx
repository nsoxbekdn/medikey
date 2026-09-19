"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Clock } from "lucide-react";

export function CountdownBadge({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState(() => new Date(expiresAt).getTime() - Date.now());

  useEffect(() => {
    const id = setInterval(() => setRemaining(new Date(expiresAt).getTime() - Date.now()), 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  if (remaining <= 0) return <Badge variant="outline">Expired</Badge>;

  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);

  return (
    <Badge variant="blue" className="h-7 gap-1.5 rounded-full px-3 text-sm font-normal">
      <Clock className="h-3.5 w-3.5" strokeWidth={2} />
      {hours > 0 ? `${hours}h ` : ""}
      {minutes}m {seconds}s remaining
    </Badge>
  );
}
