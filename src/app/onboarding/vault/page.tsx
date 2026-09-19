"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { VaultProvider, useVault } from "@/lib/vault/VaultProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createSupabaseBrowserClient } from "@/lib/db/client";

function OnboardingInner() {
  const router = useRouter();
  const { loading, hasVaultRecord, setup } = useVault();
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    createSupabaseBrowserClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!data.user) router.push("/auth/sign-in");
      });
  }, [router]);

  useEffect(() => {
    if (!loading && hasVaultRecord) router.push("/dashboard");
  }, [loading, hasVaultRecord, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (passphrase.length < 10) {
      setError("Use at least 10 characters for your vault passphrase.");
      return;
    }
    if (passphrase !== confirm) {
      setError("Passphrases do not match.");
      return;
    }
    setBusy(true);
    try {
      await setup(passphrase);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vault setup failed.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-secondary/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Create your encryption vault</CardTitle>
          <CardDescription>
            This passphrase never leaves your browser. It protects the private key used to encrypt your medical
            records. MediKey cannot recover it for you.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="passphrase">Vault passphrase</Label>
              <Input
                id="passphrase"
                type="password"
                minLength={10}
                required
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm passphrase</Label>
              <Input
                id="confirm"
                type="password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Generating keys in your browser..." : "Create vault"}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">
            A 256-bit AES-GCM root key and an ECDH P-256 keypair are generated on this device. The private material
            is wrapped with a key derived from your passphrase (PBKDF2-SHA-256) before anything is saved.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

export default function OnboardingVaultPage() {
  return (
    <VaultProvider>
      <OnboardingInner />
    </VaultProvider>
  );
}
