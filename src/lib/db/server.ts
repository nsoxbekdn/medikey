import "server-only";
import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // called from a Server Component; middleware refreshes the session instead
        }
      },
    },
  });
}

// Shared, request-deduplicated auth check for Server Components and Route
// Handlers. React's cache() memoizes this per request, so a layout + page
// (or a route handler that needs it twice) share one verification instead of
// each calling the Auth server separately.
//
// Uses getClaims() rather than getUser(): this project's JWTs are signed
// with an asymmetric key (ES256, confirmed against the live project), so
// getClaims() verifies the JWT locally via WebCrypto against a cached JWKS
// instead of making a network round trip to the Auth server on every call
// (which is what getUser() always does). It still refreshes the session
// first if the token is near expiry, so this is not a weaker check — same
// verified identity, fewer network requests. See PERFORMANCE.md Phase 3.
export const getVerifiedUser = cache(async (): Promise<{ id: string; email: string | null } | null> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return { id: data.claims.sub, email: (data.claims.email as string | undefined) ?? null };
});

// Service-role client for provider-portal routes that must bypass RLS in a
// controlled way (share-state enforcement happens explicitly in code, never
// by exposing this client to the browser).
import { createClient } from "@supabase/supabase-js";

export function createSupabaseServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
