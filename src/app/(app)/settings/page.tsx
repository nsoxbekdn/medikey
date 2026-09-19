import { createSupabaseServerClient, getVerifiedUser } from "@/lib/db/server";
import { UserCryptoRow } from "@/lib/db/types";
import { PageHeader } from "@/components/layout/PageHeader";

export default async function SettingsPage() {
  const supabase = await createSupabaseServerClient();
  const user = await getVerifiedUser();
  const { data } = await supabase.from("user_crypto").select("*").eq("user_id", user!.id).maybeSingle();
  const crypto = data as UserCryptoRow | null;

  return (
    <div>
      <PageHeader title="Settings" description="Manage your account and review how your vault is protected." />
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <SettingsRow title="Profile" description="The email address associated with your MediKey account."><p className="text-sm text-foreground">{user?.email}</p></SettingsRow>
        <SettingsRow title="Vault security" description="Only your public key and key-derivation parameters are stored remotely.">
          {crypto ? <dl className="grid gap-2 text-sm sm:grid-cols-3"><SettingValue label="Key derivation" value={crypto.kdf_algorithm} /><SettingValue label="Iterations" value={crypto.kdf_iterations.toLocaleString()} /><SettingValue label="Vault created" value={new Date(crypto.created_at).toLocaleDateString()} /></dl> : <p className="text-sm text-muted-foreground">No vault set up yet.</p>}
        </SettingsRow>
        <SettingsRow title="Privacy" description="Medical plaintext remains inside authorized browsers."><p className="text-sm text-foreground">Records are encrypted before remote storage.</p></SettingsRow>
        <SettingsRow title="AI processing" description="Optional processing is limited to sanitized context."><p className="text-sm text-foreground">{process.env.AI_API_KEY ? "Configured provider active" : "Disabled"}</p></SettingsRow>
      </div>
    </div>
  );
}

function SettingsRow({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="grid gap-4 border-b border-border-subtle px-6 py-6 last:border-b-0 md:grid-cols-[240px_1fr]"><div><h2 className="text-[15px] font-semibold">{title}</h2><p className="mt-1 max-w-sm text-sm leading-5 text-muted-foreground">{description}</p></div><div className="md:pt-0.5">{children}</div></section>;
}

function SettingValue({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-medium text-foreground">{value}</dd></div>;
}
