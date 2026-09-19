"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

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
    <Badge variant="outline" className="font-mono">
      {hours > 0 ? `${hours}h ` : ""}
      {minutes}m {seconds}s remaining
    </Badge>
  );
}
