"use client";

import { useState } from "react";
import { Check, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { WorkflowStepper } from "@/components/upload/WorkflowStepper";
import { UploadWizard } from "@/components/documents/UploadWizard";
import { VaultUnlockCard } from "@/components/vault/VaultUnlockGate";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const STEPS = ["Upload", "Privacy X-Ray", "Encrypt", "Vault"];

const CHECKLIST = ["Local-only processing", "Automatic privacy scan", "Encrypted before storage", "Patient-controlled sharing"];

const NEXT = [
  ["Upload", "Your file is processed locally."],
  ["Privacy X-Ray", "Sensitive identifiers are detected for review."],
  ["Encrypt", "The approved record is encrypted in your browser."],
  ["Vault", "Only encrypted data is stored remotely."],
];

export default function UploadPage() {
  const [stepIndex, setStepIndex] = useState(0);
  const wide = stepIndex === 1; // Privacy X-Ray needs the full width

  return (
    <div>
      <PageHeader title="Upload a record" description="Local processing, privacy review, then encryption — in that order." />

      <div className="mb-6">
        <WorkflowStepper steps={STEPS} current={stepIndex} />
      </div>

      <div className={wide ? "" : "grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]"}>
        <div className="min-w-0">
          <UploadWizard onStepChange={setStepIndex} />
        </div>

        {!wide && (
          <aside className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-success" strokeWidth={1.75} />
                  Your data stays on this device
                </CardTitle>
                <CardDescription>
                  Your medical record is processed locally in your browser and encrypted before storage. Our servers never receive the plaintext record.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {CHECKLIST.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-foreground">
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-success-soft">
                        <Check className="h-3 w-3 text-success" strokeWidth={2.5} />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="rounded-md border border-success/20 bg-success-soft px-3 py-2 text-xs font-medium text-[#027a48]">
                  Plaintext medical records never reach our backend.
                </div>
              </CardContent>
            </Card>

            <VaultUnlockCard />

            <Card>
              <CardHeader>
                <CardTitle>What happens next</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-3">
                  {NEXT.map(([title, body], i) => (
                    <li key={title} className="flex gap-3">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold text-blue">
                        {i + 1}
                      </span>
                      <div>
                        <div className="text-[13.5px] font-medium text-foreground">{title}</div>
                        <div className="text-xs text-muted-foreground">{body}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </aside>
        )}
      </div>
    </div>
  );
}
