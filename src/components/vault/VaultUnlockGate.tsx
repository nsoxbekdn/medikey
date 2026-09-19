"use client";

import { useState } from "react";
import Link from "next/link";
import { useVault } from "@/lib/vault/VaultProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Lock, LockOpen } from "lucide-react";

// Card that shows the unlock form, or the unlocked state. Always renders.
export function VaultUnlockCard({ className }: { className?: string }) {
  const { loading, hasVaultRecord, unlocked, unlock } = useVault();
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="h-24 animate-pulse rounded-md" />
      </Card>
    );
  }

  if (!hasVaultRecord) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} /> No vault yet
          </CardTitle>
          <CardDescription>Create a vault to generate your encryption keys in this browser.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button render={<Link href="/onboarding/vault" />} nativeButton={false}>
            Create vault
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (unlocked) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LockOpen className="h-4 w-4 text-success" strokeWidth={1.75} /> Vault unlocked
          </CardTitle>
          <CardDescription>Encryption keys are available only for this browser session.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await unlock(passphrase);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unlock failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} /> Unlock your vault
        </CardTitle>
        <CardDescription>Enter your passphrase to decrypt records in this browser session.</CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="unlock-passphrase">Vault passphrase</Label>
            <Input
              id="unlock-passphrase"
              type="password"
              required
              autoComplete="current-password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Unlocking..." : "Unlock vault"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

// Blocks children until the vault is unlocked.
export function VaultUnlockGate({ children }: { children: React.ReactNode }) {
  const { loading, unlocked } = useVault();
  if (!loading && unlocked) return <>{children}</>;
  return (
    <div className="max-w-md">
      <VaultUnlockCard />
    </div>
  );
}
