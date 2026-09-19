import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/db/server";
import { VaultProvider } from "@/lib/vault/VaultProvider";
import { AppShell } from "@/components/layout/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  return (
    <VaultProvider>
      <AppShell userEmail={user.email ?? "Patient"}>{children}</AppShell>
    </VaultProvider>
  );
}
