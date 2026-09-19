import Link from "next/link";
import { ArrowRight, Check, FileText, LockKeyhole, ShieldCheck } from "lucide-react";
import { createSupabaseServerClient, getVerifiedUser } from "@/lib/db/server";
import { DocumentRow, VitalsDatasetRow } from "@/lib/db/types";
import { DashboardBloodPressure } from "@/components/dashboard/DashboardBloodPressure";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const user = await getVerifiedUser();
  const [{ data: documents }, { data: vitals }, { count: sanitizedCount }] = await Promise.all([
    supabase.from("documents").select("*").eq("owner_id", user!.id).order("created_at", { ascending: false }).limit(3),
    supabase.from("vitals_datasets").select("*").eq("owner_id", user!.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("sanitized_artifacts").select("*", { count: "exact", head: true }).eq("owner_id", user!.id),
  ]);
  const recentDocs = (documents as DocumentRow[] | null) ?? [];
  const dataset = (vitals as VitalsDatasetRow | null) ?? null;
  const today = new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date());

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-6 pb-2">
        <div><h1 className="text-[38px] font-semibold leading-tight tracking-[-0.035em] text-primary">Good morning</h1><p className="mt-2 text-[17px] text-muted-foreground">Your health information, secure and in your control.</p></div>
        <time className="pt-3 text-sm text-muted-foreground">{today}</time>
      </header>

      <section className="grid overflow-hidden rounded-xl border border-border bg-card lg:grid-cols-[1.4fr_0.8fr]">
        <div className="px-7 py-7">
          <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-primary">Your data is private and secure</h2>
          <p className="mt-1 text-[15px] text-muted-foreground">You&apos;re in control of your health information.</p>
          <div className="mt-6 flex flex-col gap-7 sm:flex-row sm:items-center">
            <div className="flex h-32 w-32 shrink-0 items-center justify-center rounded-full border-[10px] border-success/20 border-t-success border-r-success" aria-label="Vault protected">
              <div className="text-center"><ShieldCheck className="mx-auto h-7 w-7 text-success" /><span className="mt-1 block text-sm font-semibold text-primary">Protected</span></div>
            </div>
            <div className="space-y-4">
              <ProtectionCheck text="Encrypted before remote storage" />
              <ProtectionCheck text={sanitizedCount ? `${sanitizedCount} privacy-scanned record${sanitizedCount === 1 ? "" : "s"} available` : "Automatic privacy scan available"} />
              <ProtectionCheck text="Vault protected" />
            </div>
          </div>
        </div>
        <div className="border-t border-border px-7 py-7 lg:border-l lg:border-t-0">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-soft text-blue"><LockKeyhole className="h-6 w-6" /></div>
          <h3 className="mt-5 text-base font-semibold text-primary">Your data stays with you.</h3>
          <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">Readable medical records are processed locally and encrypted before remote storage.</p>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[0.92fr_1.08fr]">
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between px-6 py-5"><h2 className="text-xl font-semibold tracking-[-0.02em] text-primary">Recent records</h2><Link href="/vault" className="flex items-center gap-1 text-sm font-medium text-blue">View all <ArrowRight className="h-4 w-4" /></Link></div>
          {recentDocs.length === 0 ? <p className="border-t border-border-subtle px-6 py-12 text-center text-sm text-muted-foreground">No medical records yet.</p> : <ul className="divide-y divide-border-subtle px-6">{recentDocs.slice(0, 2).map((doc) => <li key={doc.id}><Link href={`/vault/${doc.id}`} className="group flex items-center gap-4 py-5"><span className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-soft text-blue"><FileText className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-primary">{doc.title_safe}</span><span className="mt-1 block text-xs text-muted-foreground">Encrypted record · {new Date(doc.created_at).toLocaleDateString()}</span></span><ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-blue" /></Link></li>)}</ul>}
        </section>

        <section className="rounded-xl border border-border bg-card px-6 py-5">
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-primary">Blood pressure</h2>
          <div className="mt-4"><DashboardBloodPressure dataset={dataset} /></div>
        </section>
      </div>

      <section className="rounded-xl border border-border bg-card px-6 py-5">
        <div className="flex items-center justify-between"><h2 className="text-xl font-semibold tracking-[-0.02em] text-primary">Health timeline</h2><Link href="/vault" className="flex items-center gap-1 text-sm font-medium text-blue">View all <ArrowRight className="h-4 w-4" /></Link></div>
        {recentDocs.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">Your timeline will appear as records are added.</p> : <ol className="relative mt-8 grid gap-8 md:grid-cols-3 md:gap-0 before:absolute before:left-3 before:right-3 before:top-2 before:hidden before:h-px before:bg-border md:before:block">{recentDocs.map((doc, index) => <li key={doc.id} className="relative md:px-4"><span className={`relative z-10 block h-4 w-4 rounded-full border-4 border-card ${index === 0 ? "bg-blue" : index === 1 ? "bg-teal" : "bg-muted-foreground-soft"}`} /><time className="mt-4 block text-xs text-muted-foreground">{new Date(doc.created_at).toLocaleDateString()}</time><Link href={`/vault/${doc.id}`} className="mt-2 block truncate text-sm font-semibold text-primary hover:text-blue">{doc.title_safe}</Link><span className="mt-1 block text-xs text-muted-foreground">Encrypted medical record</span></li>)}</ol>}
      </section>
    </div>
  );
}

function ProtectionCheck({ text }: { text: string }) {
  return <div className="flex items-center gap-3 text-sm text-primary"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-success text-white"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span><span>{text}</span></div>;
}
