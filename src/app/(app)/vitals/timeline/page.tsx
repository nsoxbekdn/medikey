import { HealthTimeline } from "@/components/timeline/HealthTimeline";

export default function HealthTimelinePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Health Timeline</h1>
        <p className="text-muted-foreground">
          A chronological view built from your uploaded reports and recorded vitals — decrypted only in this browser.
        </p>
      </div>
      <HealthTimeline />
    </div>
  );
}
