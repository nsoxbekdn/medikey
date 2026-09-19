import { redirect } from "next/navigation";
import { createSupabaseServerClient, getVerifiedUser } from "@/lib/db/server";
import { DocumentRow, ShareRow } from "@/lib/db/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

// Deliberately outside the (app) route group: no sidebar, not linked from any
// customer nav/dashboard/settings surface. Judge/developer-only technical
// artifact — see docs/security-demo.md.
export default async function TechnicalSecurityDemoPage() {
  if (process.env.NEXT_PUBLIC_ENABLE_DEMO_SECURITY_VIEW !== "true") {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <Alert>
          <AlertDescription>The technical security demonstration is disabled in this environment.</AlertDescription>
        </Alert>
      </main>
    );
  }

  const user = await getVerifiedUser();
  if (!user) redirect("/auth/sign-in");

  const supabase = await createSupabaseServerClient();
  const { data: documents } = await supabase
    .from("documents")
    .select("*")
    .eq("owner_id", user.id)
    .limit(3);
  const { data: shares } = await supabase.from("shares").select("*").eq("owner_id", user.id).limit(3);

  // Owner-scoped RLS download of the real stored bytes: shows judges genuine
  // ciphertext, not a mock string.
  const previews = new Map<string, string>();
  for (const doc of (documents as DocumentRow[] | null) ?? []) {
    const { data: blob } = await supabase.storage.from("encrypted-blobs").download(doc.encrypted_storage_path);
    if (!blob) continue;
    const bytes = new Uint8Array((await blob.arrayBuffer()).slice(0, 32));
    previews.set(doc.id, Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join(" "));
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <div className="space-y-2">
        <Badge variant="outline">Technical Security Demonstration</Badge>
        <h1 className="text-2xl font-semibold">Simulated server breach</h1>
        <p className="text-muted-foreground">
          Developer/judge artifact, not part of the patient product. Simulation using this account&apos;s own synthetic
          data — real encryption is not weakened for this page.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What an attacker with full database + storage access would see</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 font-mono text-xs">
          <div>
            <p className="text-muted-foreground">Account ID</p>
            <p className="break-all">{user.id}</p>
          </div>
          {((documents as DocumentRow[] | null) ?? []).map((doc) => (
            <div key={doc.id} className="space-y-1 border-t pt-3">
              <p className="text-muted-foreground">Stored object path</p>
              <p className="break-all">{doc.encrypted_storage_path}</p>
              <p className="text-muted-foreground">SHA-256 digest (safe, not a secret)</p>
              <p className="break-all">{doc.sha256_digest}</p>
              {previews.has(doc.id) && (
                <>
                  <p className="text-muted-foreground">First 32 stored bytes (actual)</p>
                  <p className="break-all">{previews.get(doc.id)}</p>
                </>
              )}
              <p className="text-muted-foreground">Medical plaintext</p>
              <p className="text-red-600">UNAVAILABLE — bytes at that path are AES-256-GCM ciphertext</p>
              <p className="text-muted-foreground">Document decryption key</p>
              <p className="text-red-600">NOT STORED IN PLAINTEXT — only wrapped under the owner&apos;s vault key</p>
            </div>
          ))}
          {((shares as ShareRow[] | null) ?? []).map((share) => (
            <div key={share.id} className="space-y-1 border-t pt-3">
              <p className="text-muted-foreground">Share record ({share.provider_label})</p>
              <p className="text-red-600">Share secret: NOT STORED — it lives only in a URL fragment the server never receives</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
