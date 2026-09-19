import { ShareStatus } from "@/lib/db/types";

export interface ShareTimestamps {
  revoked_at: string | null;
  one_time: boolean;
  consumed_at: string | null;
  expires_at: string;
}

// Backend must derive effective status from authoritative timestamps, never
// trust a client-supplied or stale `status` column alone.
export function deriveShareStatus(s: ShareTimestamps, now: Date = new Date()): ShareStatus {
  if (s.revoked_at) return "REVOKED";
  if (s.one_time && s.consumed_at) return "CONSUMED";
  if (now.getTime() >= new Date(s.expires_at).getTime()) return "EXPIRED";
  return "ACTIVE";
}

export function isRetrievable(status: ShareStatus): boolean {
  return status === "ACTIVE";
}

export const SHARE_DURATION_PRESETS = [
  { label: "10 minutes", ms: 10 * 60 * 1000 },
  { label: "1 hour", ms: 60 * 60 * 1000 },
  { label: "24 hours", ms: 24 * 60 * 60 * 1000 },
  { label: "48 hours", ms: 48 * 60 * 60 * 1000 },
] as const;
