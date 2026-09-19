"use client";

import { VaultUnlockGate } from "@/components/vault/VaultUnlockGate";
import { ShareWizard } from "@/components/sharing/ShareWizard";

export default function NewSharePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Create a secure share</h1>
      </div>
      <VaultUnlockGate>
        <ShareWizard />
      </VaultUnlockGate>
    </div>
  );
}
