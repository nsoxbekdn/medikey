import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/db/server";
import { DocumentRow } from "@/lib/db/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function VaultPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data } = await supabase
    .from("documents")
    .select("*")
    .eq("owner_id", user!.id)
    .order("created_at", { ascending: false });
  const documents = (data as DocumentRow[] | null) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Vault</h1>
          <p className="text-muted-foreground">Every file here is stored as ciphertext.</p>
        </div>
        <Button nativeButton={false} render={<Link href="/upload">Upload Record</Link>} />
      </div>

      {documents.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Your vault is empty. Upload a PDF, TXT, or CSV to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {documents.map((doc) => (
            <Link key={doc.id} href={`/vault/${doc.id}`}>
              <Card className="transition-colors hover:bg-secondary/40">
                <CardContent className="flex flex-wrap items-center justify-between gap-2 py-4">
                  <div>
                    <p className="font-medium">{doc.title_safe}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(doc.created_at).toLocaleString()} · {(doc.byte_size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      Encrypted
                    </Badge>
                    {doc.privacy_scan_completed && <Badge variant="outline">Privacy scanned</Badge>}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
