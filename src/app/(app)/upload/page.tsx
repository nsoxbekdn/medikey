"use client";

import { VaultUnlockGate } from "@/components/vault/VaultUnlockGate";
import { UploadWizard } from "@/components/documents/UploadWizard";

export default function UploadPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Upload a record</h1>
        <p className="text-muted-foreground">Local processing, privacy review, then encryption — in that order.</p>
      </div>
      <VaultUnlockGate>
        <UploadWizard />
      </VaultUnlockGate>
    </div>
  );
}
