import Link from "next/link";
import { ArrowRight, CheckCircle2, FileText, HeartPulse, UploadCloud } from "lucide-react";
import { createSupabaseServerClient, getVerifiedUser } from "@/lib/db/server";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/layout/Section";
import { DocumentRow } from "@/lib/db/types";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const user = await getVerifiedUser();
  const [{ data: documents }, { count: sanitizedCount }] = await Promise.all([
    supabase.from("documents").select("*").eq("owner_id", user!.id).order("created_at", { ascending: false }).limit(2),
    supabase.from("sanitized_artifacts").select("*", { count: "exact", head: true }).eq("owner_id", user!.id),
  ]);
  const recentDocs = (documents as DocumentRow[] | null) ?? [];
  const name = (user?.email?.split("@")[0] ?? "there").split(/[._-]/)[0];

  return (
    <div className="space-y-10">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-sm font-medium text-blue">Overview</p>
          <h1 className="text-[32px] font-semibold tracking-[-0.025em] text-foreground">Good morning, <span className="capitalize">{name}</span></h1>
          <p className="mt-2 text-[15px] text-muted-foreground">Your health information, secure and in your control.</p>
        </div>
        <Button nativeButton={false} render={<Link href="/upload"><UploadCloud className="h-4 w-4" />Upload record</Link>} />
      </header>

      <div className="grid gap-8 xl:grid-cols-[1.05fr_0.95fr]">
        <Section title="Your data is private and secure" description="Protection is applied before records leave your browser.">
          <div className="grid gap-1 px-6 py-5">
            <PrivacyCheck label="Encrypted before remote storage" />
            <PrivacyCheck label={sanitizedCount ? `${sanitizedCount} sanitized record${sanitizedCount === 1 ? "" : "s"} available` : "Privacy scanning available before sharing"} />
            <PrivacyCheck label="Vault protected by client-side encryption" />
          </div>
        </Section>

        <Section title="Recent records" action={<Link href="/vault" className="flex items-center gap-1 text-sm font-medium text-blue hover:underline">View all <ArrowRight className="h-3.5 w-3.5" /></Link>}>
          {recentDocs.length === 0 ? (
            <div className="px-6 py-8">
              <p className="text-sm font-medium text-foreground">No medical records yet.</p>
              <p className="mt-1 text-sm text-muted-foreground">Upload your first record to add it to your encrypted vault.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border-subtle px-6">
              {recentDocs.map((doc) => (
                <li key={doc.id}>
                  <Link href={`/vault/${doc.id}`} className="group flex items-center gap-4 py-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-soft text-blue"><FileText className="h-[18px] w-[18px]" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground group-hover:text-blue">{doc.title_safe}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">Added {new Date(doc.created_at).toLocaleDateString()}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground-soft" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <section className="border-t border-border pt-7">
        <h2 className="text-[17px] font-semibold text-foreground">Continue your health record</h2>
        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
          <Link href="/vitals" className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-blue"><HeartPulse className="h-4 w-4" />Review vitals <ArrowRight className="h-3.5 w-3.5" /></Link>
          <Link href="/shares/new" className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-blue"><FileText className="h-4 w-4" />Create a secure share <ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
      </section>
    </div>
  );
}

function PrivacyCheck({ label }: { label: string }) {
  return <div className="flex items-center gap-3 py-2.5 text-sm text-foreground"><CheckCircle2 className="h-[18px] w-[18px] shrink-0 text-success" aria-hidden="true" /><span>{label}</span></div>;
}
