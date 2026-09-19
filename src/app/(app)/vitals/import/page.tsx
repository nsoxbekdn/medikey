"use client";

import { VaultUnlockGate } from "@/components/vault/VaultUnlockGate";
import { VitalsUploadWizard } from "@/components/vitals/VitalsUploadWizard";

export default function VitalsImportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Import vitals</h1>
      </div>
      <VaultUnlockGate>
        <VitalsUploadWizard />
      </VaultUnlockGate>
    </div>
  );
}
