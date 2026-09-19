# BUILD_STATUS

Last verified: 2026-09-19 · `npm run lint` ✅ (4 cosmetic warnings) · `npm run typecheck` ✅ · `npm test` ✅ 23/23 · `npm run build` ✅ · live flow previously verified in browser against hosted Supabase; new remote-sharing migration still requires deployment validation.

## Remote sharing

| Check | Status |
|---|---|
| Production-origin URL (`window.location.origin`) | PASS |
| Transactional owner-bound share creation | PASS |
| Direct private Storage download (45-second URL) | PASS |
| Fragment secret never sent/stored | PASS |
| Selective documents / vitals payload boundary | PASS |
| Expiry / revocation / atomic one-time state | PASS |
| Cross-network provider test on deployed Vercel URL | FAIL — pending deployment/manual two-network test |
| Patient-offline-after-share test | FAIL — pending deployment/manual test |

## Fully implemented (MVP — Definition of Done §65, all 24 items)

- Register / login / logout / vault onboarding / vault unlock gate
- Client-side crypto: AES-GCM-256 doc keys, PBKDF2-wrapped vault bundle, ECDH keypair, SHA-256 integrity
- Upload PDF/TXT/CSV → local parse (PDF.js / text) → Privacy X-Ray → sanitized derivative (leak-verified) → encrypt → ciphertext upload
- Vault list + owner decrypt with integrity check
- Vitals CSV import, header mapping, encrypted dataset, Recharts dashboard with stats
- Share wizard: recipient → selective disclosure (doc original/sanitized + per-metric vitals) → privacy label → duration/one-time → QR + fragment link + consent receipt
- Server-side share state (`/api/shares/[id]/status|payload|revoke|event|consume`) derived from timestamps; 403 on revoked/expired/consumed
- Provider portal: countdown, read-only badge, local decryption, per-share isolation, filtered vitals
- Revocation, one-time links, access log timeline, breach simulator with real ciphertext bytes
- RLS on all tables; no anonymous policies; private storage bucket

## Partially complete

- **AI Health Copilot** — `HealthCopilotProvider` interface, `MockHealthCopilotProvider`, `/api/ai/query` (validated, sanitized-input only), `rag.ts` chunk + keyword retrieval. No UI surface yet; no real provider adapter.
- **Trust Lens** — the provider portal shows the "decrypted inside this browser" badge; a dedicated per-operation Trust Lens panel is not built.
- **Medical snapshot / timeline / What-changed** — not built.

## Mocked integrations

- AI provider (mock returns clearly-labelled synthetic text when `AI_API_KEY` is unset)
- IPFS (`IPFSEncryptedBlobStore` throws "not configured"; interface-compatible)

## Intentionally simplified

- Provider identity is patient-typed (`provider_verified=false`); schema ready for a verifier.
- Vitals share creates a filtered re-encrypted copy per share (extra storage object) so unselected metrics never leave — chosen over server-side filtering, which would require server-side decryption.
- Sanitized artifact reuses the document key with its own IV (no separate key wrapper row).
- Access-log inserts go through the service-role client (no anon insert policy).
- PDF-native redaction not attempted; sanitized text derivative is the shareable artifact.
- Vitals delete uses `window.confirm`.

## Known bugs / rough edges

- `SharesList` countdown uses `formatDistanceToNowStrict` at render time only (refreshes on navigation, not live).
- `DocumentDetail` opens non-text originals (PDF) in a new tab via object URL — fine for demo, not a viewer.
- Large PDFs (>15 MB) are refused rather than streamed.

## Security limitations

See README → *Security limitations* and *Threat model*.

## Production Deployment

See `docs/DEPLOYMENT.md`. Target: GitHub → Vercel → existing Supabase.

| Item | Status |
|---|---|
| Deploy hardening (server-only guard, UUID param validation, security headers/CSP, no-store on `/api/*` + `/share/*`, fragment stripped after import, force-dynamic portal) | ✅ done, verified locally 2026-09-19 |
| Secret scan of git history + client bundle | ✅ clean (no `sb_secret_` value, no `SUPABASE_SERVICE_ROLE_KEY` in `.next/static`) |
| Local prod build / lint / typecheck / tests | ✅ |
| GitHub repo pushed | ⬜ |
| Vercel build status | ⬜ |
| Deployed URL | ⬜ |
| Supabase Site URL / Redirect URLs updated | ⬜ |
| Production share flow verified (incognito) | ⬜ |
| Production encryption verified (blob = ciphertext) | ⬜ |
| Expiry 403 / revoke 403 / one-time 403 verified in prod | ⬜ |
| Vitals verified in prod | ⬜ |
| Known deployment issues | CSP uses `'unsafe-inline'` for script/style (no nonce pipeline). Provider page reload after decrypt needs the original link (fragment is intentionally removed). |

## Performance optimization (2026-09-19)

Full audit + 11-phase optimization pass. Details, before/after measurements, and security-regression notes in `PERFORMANCE.md`.

| Phase | Status |
|---|---|
| 1. Vitals chart rendering (downsampling, memoization) | ✅ PASS — 5k-row dataset viewer: hang/>45s → 456ms; 50k rows render instantly |
| 2. Byte-native crypto (no base64 for large blobs) | ✅ PASS — 325ms/10MB eliminated per document/vitals op |
| 3. SSR auth dedup (`getClaims()` + `React.cache()`) | ✅ PASS — single-query pages 1.1-1.7s → ~290-330ms |
| 4. Query waterfall parallelization | ✅ PASS — dashboard/share-wizard/vitals-viewer reads run concurrently |
| 5. Document save (parallel encrypt+upload, `save_document` RPC) | ✅ PASS — 3 sequential inserts → 1 atomic RPC |
| 6. Vitals save (`getSession()`, parallel encrypt) | ✅ PASS |
| 7. Provider access refactor (`claim_share_access` RPC + signed URLs) | ✅ PASS — migration applied live, full security regression run (see below) |
| 8. Share creation N+1 (bulk wrapper query, bounded vitals concurrency) | ✅ PASS |
| 9. CSV worker (off-main-thread parse/normalize) | ✅ PASS — 50k rows: 0 long tasks recorded, main thread never blocks |
| 10. PDF bounded-concurrency extraction + progress | ✅ PASS — 3.6s → 2.6-2.7s (corrects an earlier unverified 283ms claim; see PERFORMANCE.md) |
| 11. Bundle/lazy-loading audit | ✅ PASS — Recharts/QR/pdfjs confirmed absent from non-chart routes and document-only provider shares in a fresh production build |

**Live migration**: `supabase/migrations/0004_provider_access.sql` applied to the hosted project via the SQL editor. Verified: `claim_share_access` execute is `service_role`-only (anon call → 401); anon REST/storage access to all patient tables and the bucket remain empty/denied.

**Security regression** (all re-run this session against the hosted project, synthetic data only): ciphertext-only storage ✅ · wrong-key/wrong-secret clean failure, no fallback plaintext ✅ · sanitization leakage-free (Patient Name/Phone/etc. redacted) ✅ · selective vitals (only shared metrics ever leave, verified via network inspection) ✅ · expired share → 403 (derived from `expires_at`, not the stale `status` column) ✅ · revoked share → 403 ✅ · one-time share: 5 concurrent claims → exactly 1 success, 4× `403 CONSUMED` (atomic row-lock, no race) ✅ · RLS: anon gets `[]`/404 on every table and the bucket ✅ · service-role key never in client bundle, `server-only` import guard in place ✅.

**Known deviation**: the interrupted session's handoff claimed 283ms for the 120-page PDF phase; this could not be reproduced (measured 2.6-2.7s, a real ~25-30% improvement over the 3.6s baseline) and the false number was corrected rather than carried forward.

**Not done / deliberately left**: Supabase region migration (ap-southeast-2 RTT is the largest remaining lever; explicitly the owner's infrastructure call, not attempted here). No architecture, security posture, or UI redesign changes were made as part of this pass.

## Next task

Add the AI Copilot UI (`/vault/[id]` → "Explain this report") with the sanitized-preview confirmation step, wired to the existing `/api/ai/query`.
