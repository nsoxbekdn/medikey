import { createSupabaseServerClient } from "@/lib/db/server";
import { UserCryptoRow } from "@/lib/db/types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data } = await supabase.from("user_crypto").select("*").eq("user_id", user!.id).maybeSingle();
  const crypto = data as UserCryptoRow | null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p>{user?.email}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vault cryptography</CardTitle>
          <CardDescription>Only your public key and KDF parameters are stored server-side.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {crypto ? (
            <>
              <p>Key derivation: {crypto.kdf_algorithm}</p>
              <p>Iterations: {crypto.kdf_iterations.toLocaleString()}</p>
              <p>Vault created: {new Date(crypto.created_at).toLocaleString()}</p>
            </>
          ) : (
            <p className="text-muted-foreground">No vault set up yet.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI processing</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {process.env.AI_API_KEY ? "A configured AI provider is active." : "Disabled — no AI provider configured (demo mode)."}
        </CardContent>
      </Card>
    </div>
  );
}
