"use client";

import { useMemo } from "react";
import { PIIMatch } from "@/lib/db/types";
import { exposureScore, exposureAfterSanitization, severityBucket } from "@/lib/pii/exposure-score";
import { sanitizeText } from "@/lib/pii/sanitizer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface Props {
  originalText: string;
  matches: PIIMatch[];
  onMatchesChange: (matches: PIIMatch[]) => void;
  onConfirm: (selected: PIIMatch[]) => void;
}

const CONFIDENCE_STYLES: Record<PIIMatch["confidence"], string> = {
  high: "border-destructive/20 bg-destructive-soft text-destructive",
  medium: "border-warning/30 bg-warning-soft text-warning-foreground",
  low: "border-border bg-muted text-muted-foreground",
};

export function PrivacyXRay({ originalText, matches, onMatchesChange, onConfirm }: Props) {
  const before = useMemo(() => exposureScore(matches, true), [matches]);
  const after = useMemo(() => exposureAfterSanitization(matches), [matches]);
  const buckets = useMemo(() => severityBucket(matches), [matches]);
  const preview = useMemo(() => sanitizeText(originalText, matches).slice(0, 600), [originalText, matches]);

  function toggle(id: string) {
    onMatchesChange(matches.map((m) => (m.id === id ? { ...m, selected: !m.selected } : m)));
  }

  const selectedCount = matches.filter((m) => m.selected).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Privacy X-Ray</CardTitle>
          <CardDescription>
            {matches.length} sensitive identifier{matches.length === 1 ? "" : "s"} detected. Privacy Exposure
            Indicator is heuristic, not a security guarantee.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Exposure before</p>
              <Progress value={before} className="mt-1" />
              <p className="mt-1 text-sm font-medium">{before} / 100</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Estimated exposure after selected sanitization</p>
              <Progress value={after} className="mt-1" />
              <p className="mt-1 text-sm font-medium">{after} / 100</p>
            </div>
          </div>

          {(["high", "medium", "low"] as const).map((level) =>
            buckets[level].length > 0 ? (
              <div key={level}>
                <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{level}</p>
                <ul className="space-y-2">
                  {buckets[level].map((m) => (
                    <li
                      key={m.id}
                      className={`flex items-center justify-between rounded-md border px-3 py-2 transition-colors duration-150 motion-reduce:transition-none ${
                        m.selected ? "border-blue/30 bg-blue-soft/70" : "border-border bg-card"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox checked={m.selected} onCheckedChange={() => toggle(m.id)} id={m.id} />
                        <label htmlFor={m.id} className="text-sm">
                          <span className="font-medium">{m.label}</span>{" "}
                          <span className="font-mono text-xs text-muted-foreground">{m.value}</span>
                        </label>
                      </div>
                      <Badge variant="outline" className={CONFIDENCE_STYLES[m.confidence]}>
                        {m.confidence}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null
          )}

          {matches.length === 0 && (
            <p className="text-sm text-muted-foreground">No identifiers detected by the local scan.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sanitized preview</CardTitle>
          <CardDescription>What is removed and what remains clinically useful.</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-xs">
            {preview || "(empty document)"}
          </pre>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={() => onConfirm(matches)}>
          Encrypt &amp; save ({selectedCount} field{selectedCount === 1 ? "" : "s"} redacted)
        </Button>
      </div>
    </div>
  );
}
