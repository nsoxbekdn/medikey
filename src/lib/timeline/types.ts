export interface TimelineEvent {
  id: string;
  date: string;
  type: "lab" | "medication" | "vital" | "document" | "procedure" | "other";
  title: string;
  value?: string;
  unit?: string;
  sourceId?: string;
  sourceLabel?: string;
  confidence?: "confirmed" | "extracted";
}

export interface MetricTrend {
  metric: string;
  label: string;
  unit?: string;
  values: Array<{ date: string; value: number }>;
}
