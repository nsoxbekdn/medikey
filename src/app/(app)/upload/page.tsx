"use client";

import { useState } from "react";
import { Check, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { WorkflowStepper } from "@/components/upload/WorkflowStepper";
import { UploadWizard } from "@/components/documents/UploadWizard";
import { VaultUnlockCard } from "@/components/vault/VaultUnlockGate";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useVault } from "@/lib/vault/VaultProvider";

const STEPS = ["Unlock", "Upload", "Privacy X-Ray", "Encrypt", "Vault"];

const CHECKLIST = ["Local-only processing", "Automatic privacy scan", "Encrypted before storage", "Patient-controlled sharing"];

const NEXT = [
  ["Unlock", "Make your encryption keys available for this browser session."],
  ["Upload", "Your file is processed locally."],
  ["Privacy X-Ray", "Sensitive identifiers are detected for review."],
  ["Encrypt", "The approved record is encrypted in your browser."],
  ["Vault", "Only encrypted data is stored remotely."],
];

export default function UploadPage() {
  const { unlocked } = useVault();
  const [stepIndex, setStepIndex] = useState(0);
  const currentStep = unlocked ? stepIndex + 1 : 0;
  const wide = unlocked && stepIndex === 1; // Privacy X-Ray needs the full width

  return (
    <div>
      <PageHeader title="Upload a record" description="Unlock your vault, then process, review, and encrypt your record locally." />

      <div className="mb-6">
        <WorkflowStepper steps={STEPS} current={currentStep} />
      </div>

      <div className={wide ? "" : "grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]"}>
        <div className="min-w-0">
          {unlocked ? (
            <UploadWizard onStepChange={setStepIndex} />
          ) : (
            <section className="flex min-h-[340px] items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 py-10">
              <div className="w-full max-w-md">
                <div className="mb-5 text-center">
                  <h2 className="text-xl font-semibold tracking-[-0.02em] text-primary">Unlock before uploading</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Your vault must be unlocked so this browser can encrypt the record before it leaves your device.
                  </p>
                </div>
                <VaultUnlockCard className="border-border-subtle shadow-none" />
              </div>
            </section>
          )}
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
                <div className="rounded-md border border-success/20 bg-success-soft px-3 py-2 text-xs font-medium text-success-foreground">
                  Plaintext medical records never reach our backend.
                </div>
              </CardContent>
            </Card>

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
