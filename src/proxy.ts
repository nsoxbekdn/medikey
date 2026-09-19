import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // getClaims() verifies the JWT locally (this project uses asymmetric ES256
  // signing, confirmed against the live project) instead of always making a
  // network round trip to the Auth server like getUser() does. It still
  // refreshes the session first if the token is near expiry, so the refresh
  // behavior this proxy exists for is unchanged. See PERFORMANCE.md Phase 3.
  await supabase.auth.getClaims();

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|share/|api/shares|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
