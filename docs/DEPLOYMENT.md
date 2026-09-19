# MediKey — Deployment

## Architecture

```
Patient / Provider browser
        | HTTPS
        v
Vercel  (GitHub → auto-deploy)
  Next.js 16 UI + React
  Next.js API routes  /api/shares/*  /api/ai/query
        | server-side (service role never leaves Vercel functions)
        v
Supabase (existing project, unchanged)
  Auth (email + password, confirm-email OFF)
  Postgres + RLS (owner_id = auth.uid(), no anonymous policies)
  Private Storage bucket `encrypted-blobs` (AES-GCM ciphertext only)
```

Nothing else. No Docker, no Express, no Cloudflare, no second DB.

## Required environment variables

| Variable | Required | Vercel scope | Safe for browser? | Purpose |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Production + Preview | Yes | Supabase project URL (browser + server clients, CSP `connect-src`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Production + Preview | Yes | Supabase **publishable** key (`sb_publishable_…`) for the browser/cookie clients — RLS-bound |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Production + Preview (trusted repo only) | **NO** | Supabase **secret** key (`sb_secret_…`) for provider-portal routes; `server-only` import guards it |
| `NEXT_PUBLIC_ENABLE_DEMO_SECURITY_VIEW` | No (default off) | Production + Preview | Yes | `true` enables the standalone `/demo-security` judge view; it is absent from customer navigation |
| `AI_API_KEY` | No | — | No | Unset ⇒ mock AI provider (clearly labelled). Server-only. |
| `AI_PROVIDER`, `IPFS_PROVIDER`, `IPFS_API_TOKEN` | No | — | No | Listed in `.env.example`; **not read by any code yet**. Leave unset. |

Legacy names kept on purpose: the code reads `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` but the values are the new-format publishable/secret keys. Do not rename.

## GitHub setup

```bash
cd ~/Desktop/Projects/websites/medikey
git status                      # must be clean; .env is ignored via .env*
gh repo create medikey --private --source=. --push
```

Repo must be private (service-role key goes into Vercel Preview for this repo).

## Vercel setup

1. vercel.com → **Add New… → Project** → Import `medikey` from GitHub.
2. Framework preset: **Next.js** (auto-detected). Root directory: `/`. Build command default (`next build`). Node 24 default.
3. **Environment Variables** → add the three required vars above (values from local `.env`, never from chat/logs). Tick **Production** and **Preview**. Leave `NEXT_PUBLIC_ENABLE_DEMO_SECURITY_VIEW` unset/false for customer deployments.
4. **Deploy**. Note the URL: `https://<project>.vercel.app`.
5. No `vercel.json`/`vercel.ts` needed — headers, CSP and cache rules live in `next.config.ts`.

Redeploy only if you change env vars after the first build (`NEXT_PUBLIC_*` are inlined at build time).

## Supabase production URL settings

Dashboard → **Authentication → URL Configuration**:

| Field | Value |
|---|---|
| Site URL | `https://<project>.vercel.app` |
| Redirect URLs | `https://<project>.vercel.app/**` and `https://*-<team>.vercel.app/**` (preview deploys) |

Auth flow is email + password only (`signUp` / `signInWithPassword`, no magic link, no OAuth, no `emailRedirectTo`), so these only affect email templates; still set them so nothing points at `localhost`. Keep **Confirm email = OFF** for the demo (already set). Keep `http://localhost:3000/**` in Redirect URLs for local dev.

## Security notes

- **Service-role key** — only `src/lib/db/server.ts` reads it; the module starts with `import "server-only"`, so any client import fails the build. Verified absent from `.next/static`.
- **Encrypted blobs only** — every `storage.upload` in the app receives AES-GCM output; bucket is private with owner-prefix policies; `/api/shares/:id/access` returns 45-second signed URLs for only that share's ciphertext, downloaded directly from Storage.
- **Fragment secret** — generated client-side, placed after `#`, never in a request/query/log. `/share/[shareId]` reads `location.hash`, imports the key into Web Crypto, then `history.replaceState` strips it from the URL. Reload after that ⇒ "Missing decryption secret" by design; reopen the original link.
- **Headers** (`next.config.ts`): CSP (`default-src 'self'`, Supabase origin in `connect-src`, `worker-src blob:` for PDF.js, `img-src data:` for QR), `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: no-referrer`. `Cache-Control: no-store` on `/api/*` and `/share/*`. CSP uses `'unsafe-inline'` for scripts/styles (no nonce pipeline) — documented tradeoff, still blocks foreign origins.
- **Input validation** — share ids must be UUIDs (404 otherwise); all POST bodies pass Zod; malformed JSON ⇒ 400, not 500.
- **Share state** — derived from `revoked_at / consumed_at / expires_at` on every request; `access` returns 403 unless ACTIVE. `status` is informational. One-time claim is atomic and occurs only after signed URLs are ready.
- **No analytics** in the project. If any is added later, exclude `/share/*`.
- **Rendering** — every patient route and `/share/[shareId]` is `ƒ (Dynamic)`; only `/`, `/auth/*`, `/onboarding/vault` are static shells.

## Production validation (run from incognito on the Vercel URL)

Auth: sign up · sign in · sign out · refresh keeps session · signed-out `/dashboard` → `/auth/sign-in`
Vault: onboarding · unlock · refresh ⇒ locked · no key in console
Upload: `public/demo/sample_lab_report.txt` → X-Ray finds identifiers → sanitized preview → Encrypt & save → appears in `/vault`
Vitals: `public/demo/vitals_demo.csv` → auto-mapped → chart + stats
Share: create → URL is `https://<project>.vercel.app/share/<uuid>#<secret>` → QR encodes same URL → Network tab shows no `#…` in any request → open in incognito/phone → decrypts selected items only, address bar loses the fragment
Security: revoke ⇒ provider refresh `ACCESS REVOKED` (API 403) · expired ⇒ 403 · one-time second open ⇒ 403 · wrong fragment ⇒ clean error · technical demo `/demo-security` (only when explicitly enabled) shows ciphertext bytes · `curl -sI https://<project>.vercel.app/share/x | grep -i content-security`
