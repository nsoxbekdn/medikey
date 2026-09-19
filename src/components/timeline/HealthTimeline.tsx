"use client";

import { useEffect, useMemo, useState } from "react";
import { useVault } from "@/lib/vault/VaultProvider";
import { createSupabaseBrowserClient } from "@/lib/db/client";
import { unwrapKey } from "@/lib/crypto/key-wrap";
import { aesDecryptBytes } from "@/lib/crypto/aes";
import { bufToUtf8 } from "@/lib/crypto/encoding";
import { mapWithConcurrency } from "@/lib/async/concurrency";
import { DocumentRow, VitalsDatasetRow, VitalsPoint } from "@/lib/db/types";
import { buildTimelineEvents, buildMetricTrends, groupEventsByYear } from "@/lib/timeline/build";
import { TimelineEvent } from "@/lib/timeline/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileText, HeartPulse } from "lucide-react";

const DECRYPT_CONCURRENCY = 4;

const EVENT_ICON: Record<TimelineEvent["type"], typeof FileText> = {
  lab: HeartPulse,
  medication: HeartPulse,
  vital: HeartPulse,
  document: FileText,
  procedure: HeartPulse,
  other: FileText,
};

export function HealthTimeline() {
  const { vault } = useVault();
  const [events, setEvents] = useState<TimelineEvent[] | null>(null);
  const [trends, setTrends] = useState<ReturnType<typeof buildMetricTrends> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!vault) return;
    let cancelled = false;
    (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) throw new Error("Not signed in.");

        const [{ data: documents }, { data: datasetRows }] = await Promise.all([
          supabase.from("documents").select("*").eq("owner_id", user.id),
          supabase.from("vitals_datasets").select("*").eq("owner_id", user.id),
        ]);

        const datasets = (datasetRows as VitalsDatasetRow[] | null) ?? [];
        const vitalsSources = (
          await mapWithConcurrency(datasets, DECRYPT_CONCURRENCY, async (dataset) => {
            const [key, downloadRes] = await Promise.all([
              unwrapKey(vault.rootKey, { ciphertext: dataset.wrapped_dataset_key, iv: dataset.wrapping_iv }),
              supabase.storage.from("encrypted-blobs").download(dataset.encrypted_payload_path),
            ]);
            if (!downloadRes.data) return null;
            const ciphertextBytes = new Uint8Array(await downloadRes.data.arrayBuffer());
            const plainBuf = await aesDecryptBytes(key, { ciphertext: ciphertextBytes, iv: dataset.encryption_iv });
            const points: VitalsPoint[] = JSON.parse(bufToUtf8(plainBuf));
            return { datasetId: dataset.id, datasetName: dataset.name, points };
          })
        ).filter((s): s is { datasetId: string; datasetName: string; points: VitalsPoint[] } => s !== null);

        if (cancelled) return;
        setEvents(buildTimelineEvents((documents as DocumentRow[] | null) ?? [], vitalsSources));
        setTrends(buildMetricTrends(vitalsSources));
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not build the timeline.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vault]);

  const groupedByYear = useMemo(() => (events ? groupEventsByYear(events) : []), [events]);

  if (!vault) {
    return (
      <Alert>
        <AlertDescription>Unlock your vault to build your health timeline.</AlertDescription>
      </Alert>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!events) return <p className="text-sm text-muted-foreground">Building your timeline in this browser...</p>;

  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          No timeline events yet. Upload a report or import vitals to start building your history.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {trends && trends.length > 0 && <WhatChanged trends={trends} />}

      <div className="space-y-8">
        {groupedByYear.map(([year, yearEvents]) => (
          <div key={year} className="relative pl-6">
            <div className="absolute left-[7px] top-7 bottom-0 w-px bg-border" aria-hidden />
            <div className="mb-3 flex items-center gap-2">
              <span className="relative -ml-6 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-primary bg-background" />
              <h2 className="text-lg font-semibold">{year}</h2>
            </div>
            <div className="space-y-2">
              {yearEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EventCard({ event }: { event: TimelineEvent }) {
  const Icon = EVENT_ICON[event.type];
  return (
    <Card className="border-l-2 border-l-primary/30">
      <CardContent className="flex items-start justify-between gap-3 py-3">
        <div className="flex items-start gap-3">
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground-soft" strokeWidth={1.75} />
          <div>
            <p className="text-sm font-medium">{event.title}</p>
            {event.value && (
              <p className="text-sm">
                {event.value}
                {event.unit ? ` ${event.unit}` : ""}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {new Date(event.date).toLocaleDateString()}
              {event.sourceLabel && ` · ${event.sourceLabel}`}
            </p>
          </div>
        </div>
        {event.confidence === "extracted" && (
          <Badge variant="outline" className="shrink-0 text-xs">
            Extracted
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

function directionLabel(first: number, last: number): string {
  if (last > first) return "Increased";
  if (last < first) return "Decreased";
  return "Unchanged";
}

function WhatChanged({ trends }: { trends: ReturnType<typeof buildMetricTrends> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">What changed?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Deterministic comparison of recorded values over time. Not a diagnosis — for context only.
        </p>
        {trends.map((trend) => {
          const shown = trend.values.slice(-4);
          const first = shown[0].value;
          const last = shown[shown.length - 1].value;
          return (
            <div key={trend.metric} className="border-b pb-3 last:border-b-0 last:pb-0">
              <p className="text-sm font-medium">{trend.label}</p>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono">
                  {shown.map((v) => `${v.value}${trend.unit ?? ""}`).join(" → ")}
                </span>
                <Badge variant="outline" className="text-xs">
                  {directionLabel(first, last)}
                </Badge>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
