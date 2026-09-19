import { redirect } from "next/navigation";
import { getVerifiedUser } from "@/lib/db/server";
import { VaultProvider } from "@/lib/vault/VaultProvider";
import { AppShell } from "@/components/layout/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getVerifiedUser();
  if (!user) redirect("/auth/sign-in");

  return (
    <VaultProvider>
      <AppShell userEmail={user.email ?? "Patient"}>{children}</AppShell>
    </VaultProvider>
  );
}
