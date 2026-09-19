import Link from "next/link";
import { createSupabaseServerClient, getVerifiedUser } from "@/lib/db/server";
import { DocumentRow } from "@/lib/db/types";
import { Button } from "@/components/ui/button";
import { FileText, UploadCloud } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";

export default async function VaultPage() {
  const supabase = await createSupabaseServerClient();
  const user = await getVerifiedUser();
  const { data } = await supabase
    .from("documents")
    .select("*")
    .eq("owner_id", user!.id)
    .order("created_at", { ascending: false });
  const documents = (data as DocumentRow[] | null) ?? [];

  return (
    <div>
      <PageHeader title="Vault" description="Your encrypted medical records, organized in one private place." action={<Button nativeButton={false} render={<Link href="/upload"><UploadCloud className="h-4 w-4" />Upload record</Link>} />} />

      {documents.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <FileText className="mx-auto h-6 w-6 text-muted-foreground-soft" />
          <p className="mt-4 text-sm font-medium text-foreground">No medical records yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">Upload your first record to add it to your encrypted vault.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="grid grid-cols-[1fr_auto] border-b border-border-subtle px-6 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid-cols-[1fr_180px_140px]">
            <span>Record</span><span className="hidden sm:block">Added</span><span>Status</span>
          </div>
          {documents.map((doc) => (
            <Link key={doc.id} href={`/vault/${doc.id}`} className="grid grid-cols-[1fr_auto] items-center gap-4 border-b border-border-subtle px-6 py-4 transition-colors last:border-b-0 hover:bg-muted/50 sm:grid-cols-[1fr_180px_140px]">
              <span className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-soft text-blue"><FileText className="h-4 w-4" /></span><span className="min-w-0"><span className="block truncate text-sm font-medium text-foreground">{doc.title_safe}</span><span className="block text-xs text-muted-foreground">{(doc.byte_size / 1024).toFixed(0)} KB</span></span></span>
              <span className="hidden text-sm text-muted-foreground sm:block">{new Date(doc.created_at).toLocaleDateString()}</span>
              <span className="flex items-center gap-2 text-xs font-medium text-success"><span className="h-1.5 w-1.5 rounded-full bg-success" />Encrypted</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
