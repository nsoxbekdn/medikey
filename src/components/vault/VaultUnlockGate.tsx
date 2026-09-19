"use client";

import { useState } from "react";
import { useVault } from "@/lib/vault/VaultProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Lock } from "lucide-react";

export function VaultUnlockGate({ children }: { children: React.ReactNode }) {
  const { loading, hasVaultRecord, unlocked, unlock } = useVault();
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return <p className="text-sm text-muted-foreground">Loading vault status...</p>;

  if (!hasVaultRecord) {
    return (
      <Alert>
        <AlertDescription>
          No vault found for this account yet. <a href="/onboarding/vault" className="underline">Create one</a>.
        </AlertDescription>
      </Alert>
    );
  }

  if (unlocked) return <>{children}</>;

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
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="h-4 w-4" /> Vault locked
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
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? "Unlocking..." : "Unlock vault"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
