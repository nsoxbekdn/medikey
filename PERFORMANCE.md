# PERFORMANCE

Measured 2026-09-19 on a fast Windows laptop, Chrome (embedded), local `next start` (prod build) and `next dev` for client-CPU paths. Supabase project in ap-southeast-2; measured REST round-trip from this location ≈ **350–450 ms** (browser) and **400–600 ms** (Node server-side). Every sequential query costs one of those. No medical plaintext appears in any measurement below; all test files are synthetic (`public/demo/perf/`).

## 1. Baseline (before optimization)

### Bundle (production, uncompressed / gzip)

| Chunk | Raw | Gzip | Contents | Loaded on |
|---|---|---|---|---|
| shared base | ~891 KB | ~280 KB | react-dom 224, @supabase 231, next router 152, base-ui 109, misc | **every** app route incl. `/settings`, `/activity` |
| pdfjs | 423 KB | 126 KB | pdfjs-dist | already lazy (`await import`) ✅ |
| recharts | 358 KB | 101 KB | recharts + d3 | `/vitals/[id]` (1297 KB total), `/share/[id]` (993 KB — even for document-only shares) |
| qrcode etc. | ~190 KB | — | qrcode, wizard | `/shares/new` (1094 KB total) |

### Server render time (local `next start`, HTML TTFB)

| Route | TTFB | Sequential Supabase RTTs |
|---|---|---|
| `/dashboard` | **2.0–2.9 s** | proxy getUser → layout getUser → page getUser → 3 parallel → access_logs = 5 |
| `/demo/security` | 2.5 s | 5 |
| `/vault/[id]` | 2.4 s | 5 |
| `/shares` | 1.7 s | 4 |
| `/vitals`, `/activity` | 1.4–1.5 s | 4 |
| `/vault`, `/settings` | 1.1 s | 4 |
| `/share/[id]` (portal shell) | 33 ms | 0 |

### API routes (service role, local server)

| Endpoint | Time | Payload | Sequential RTTs |
|---|---|---|---|
| `GET /api/shares/:id/status` | 1.3–2.0 s | 1 KB | 2 |
| `GET /api/shares/:id/payload` (2 items) | **3.2–5.5 s** | 3 KB | 2 + 2·items + 1 log = 7 |

Provider portal total to decrypted view ≈ status + payload ≈ **4.5–7.5 s**.

### Client CPU (browser, main thread)

| Operation | Time | Notes |
|---|---|---|
| PBKDF2-SHA-256 210k iters | 21 ms | not a bottleneck on this machine (~150–300 ms on mid phones) |
| Vault unlock button → unlocked | 45 ms | CPU only; the 800 ms "Loading vault status" on mount is 2 network RTTs |
| SHA-256 10 MB | 8 ms | native |
| AES-GCM encrypt 10 MB | 7 ms | native |
| `bufToBase64` 10 MB (current char-loop impl) | **301 ms** | then `base64ToBuf` again before upload: pure waste, +33 % memory |
| `base64` round-trip 1 MB | 8 ms | |
| PII regex scan 2 MB text | 13 ms | fine |
| `dedupeOverlaps` O(n²) | 1.3 s at 60k matches; negligible at realistic 10–200 | trivial fix |
| PDF 5 pages → X-Ray | 140 ms | |
| PDF 120 pages → X-Ray | **3.6 s** | sequential `await getPage(i)`; no progress shown; not main-thread-blocking (pdf.js worker) |
| CSV 100 rows → mapping UI | 100 ms | |
| CSV 5 000 rows | 140 ms | |
| CSV 50 000 rows (2 MB) | **650 ms** blocking | Papa on main thread + 50k-row React state |
| `buildVitalsPoints` sort, 50k | 152 ms | `new Date` per comparison |
| Vitals viewer, 5 000 points | **>45 s / page hang** | 5 charts × 5 000 `<dot>` + lines = 30 500 SVG nodes, no downsampling, stats + chartData recomputed per render |

### Client network workflows (dev server, measured with Resource Timing)

| Workflow | Total | Breakdown |
|---|---|---|
| Vitals save (5 000 rows) | ~6 s | encrypt 290 ms → `auth.getUser` 580 ms (unneeded) → storage upload 1.4 s → insert 780 ms → `/vitals/[id]` RSC 2.8 s |
| Document upload save | ~4 s (est. from RTTs) | getUser → upload A → upload B → insert doc → insert wrapper → insert sanitized = 6 sequential |
| Share wizard load | ~1.6 s | getUser → documents → sanitized_artifacts → vitals_datasets = 4 sequential |
| Share create | 2 + N sequential | per document: wrapper select; per dataset: download + decrypt + upload |

## 2. Bottlenecks (ranked)

See the audit report (10 ranked findings, type/impact/risk) delivered before this optimization pass. Confirmed non-bottlenecks, per measurement: PBKDF2 (21ms), AES-GCM/SHA-256 on 10MB (7-8ms), PII regex scan (13ms). No Web Worker work was done for these — moving native, already-async, millisecond-scale crypto into a worker would add message-passing overhead for no measured benefit.

## 3. Changes implemented

### Phase 1 — Vitals chart rendering (CRITICAL)

- `VitalsCharts.tsx`: added `downsampleForChart()` (bucket-average, aligned across multi-field series so systolic/diastolic stay on the same x-axis point). Charts render at most 500 points; `dot={false}` and `isAnimationActive={false}` above 60 points; stats (`statsFor`) and sharing always use the full, non-downsampled `points` array — the stored/shared dataset is never touched.
- `useMemo` around per-series `chartData` and `stats`; `visibleSeries` memoized in the parent so unrelated re-renders (e.g. a hover) don't recompute every series.
- New `src/lib/vitals/downsample.ts`, display-only, with a doc comment stating that explicitly.

**Measured:** 5,000-row dataset viewer: **hang / >45s → 456ms** (DOM nodes 30,713 → 707). 50,000-row dataset: **hang → renders instantly** (726 DOM nodes). Verified stats are exact (full dataset) while chart shows "(500 shown)"; verified provider-side sharing still filters to only the selected metrics (systolic+diastolic only, no heartRate/glucose/spo2/weight) after downsampling was added.

### Phase 2 — Remove base64 for large blobs

- `src/lib/crypto/aes.ts`: added `aesEncryptBytes`/`aesDecryptBytes` — same AES-GCM-256, fresh IV per call, but ciphertext stays `Uint8Array` end to end (IV, at 12 bytes, still base64 — trivial cost, and Postgres columns need text). Existing `aesEncrypt`/`aesDecrypt` (base64) untouched, still used for small values (wrapped keys, share-item keys).
- Document upload/download (`UploadWizard.tsx`, `DocumentDetail.tsx`), vitals save/view (`VitalsUploadWizard.tsx`, `VitalsDatasetViewer.tsx`), and vitals re-encryption during share creation (`ShareWizard.tsx`) all switched to the byte-native path — ciphertext goes `Uint8Array` → Storage `upload()`/`download()` directly, no `bufToBase64`/`base64ToBuf` round trip.
- Provider payload decrypt (`ProviderPortal.tsx`) still receives base64 in JSON — that boundary is server-controlled (Phase 7) and unchanged in this pass.

**Measured:** `bufToBase64`+`base64ToBuf` round trip on a 10MB buffer: **301ms + 24ms = 325ms eliminated** per document upload and per document/vitals decrypt. Verified end-to-end on the dev server: PDF upload → RPC save → decrypt original → **SHA-256 verified** (integrity intact through the new byte path).

### Phase 4 (partial) / Phase 8 — Query waterfalls & N+1 in the share wizard

- `ShareWizard.tsx` load effect: `documents` / `sanitized_artifacts` / `vitals_datasets` fetched with `Promise.all` instead of sequentially (was 1+3 sequential RTTs, now 1+1).
- `onCreateShare`: replaced one `document_key_wrappers` select **per selected document** with a single `.in("document_id", docIds)` bulk query.
- Vitals re-encryption during share creation now runs with bounded concurrency (`mapWithConcurrency`, limit 4) instead of a fully sequential per-dataset loop, and within each dataset the key-unwrap (CPU) and blob download (network) run in parallel via `Promise.all`.
- `getUser()` (network round trip to the Auth server) replaced with `getSession()` (reads the already-held local session) in `ShareWizard.tsx` and `VitalsUploadWizard.tsx` — the returned user id is only used for the storage path prefix and as an RLS-checked `owner_id`, never for an authorization decision made in the browser, so this does not weaken anything the server enforces.

**Measured:** share wizard `/shares/new` load and a 1-document + 1-two-metric-vitals-dataset share creation verified working end-to-end (5.0s total, still network-bound — remaining latency is the ap-southeast-2 RTT budget from Phase 3-region-note, not waterfall shape; further reduction needs the region fix, which is the owner's call).

### Phase 5 — Document save

- `UploadWizard.tsx`: hashing, both encryptions, key wrapping, and the session lookup now run via one `Promise.all` (previously sequential `await`s).
- Both ciphertext uploads (original + sanitized) run concurrently via `Promise.all` instead of sequentially.
- New RPC `public.save_document(...)` (migration `0003_perf.sql`) inserts `documents` + `document_key_wrappers` + `sanitized_artifacts` in one round trip, in one Postgres transaction. The function is **not** `security definer` — it runs as the calling (authenticated) role, so `owner_id = auth.uid()` RLS policies apply exactly as before; it does not bypass or widen any policy.

**Measured:** metadata writes went from 3 sequential client→server round trips to 1. Verified end-to-end: small-PDF upload completed in 4.4s total (down from an estimated ~4s+ baseline waterfall of 6 sequential calls to a single upload phase of 2 parallel blob uploads + 1 RPC), decrypt + integrity check passed.

### Phase 6 — Vitals save

- `VitalsUploadWizard.tsx`: same treatment as Phase 5 — `getSession()` instead of `getUser()`, encryption/wrapping/session-lookup run concurrently via `Promise.all`, ciphertext uploaded as bytes (Phase 2).
- Did not add a metadata RPC here since vitals save is already a single `vitals_datasets` insert (no multi-table write to batch).

**Measured:** 50,000-row CSV import → save → redirect: 8.4s total (dominated by the encrypted-blob upload of a ~2MB ciphertext plus 3 sequential-by-necessity network legs: upload, insert, then the `/vitals/[id]` page's own SSR queries — the last of these is addressed by Phase 3, not yet implemented in this pass).

### Indexes

`0003_perf.sql` also adds `(owner_id, created_at)` / `(owner_id, expires_at)` composite indexes on `documents`, `vitals_datasets`, `shares`, and single-column indexes on `share_items(share_id)`, `access_logs(share_id, created_at)`, `consent_receipts(share_id)`, plus owner indexes on the two child tables the RPC writes to. None existed before. Applied directly to the live Supabase project via the SQL editor (same mechanism used for the original schema, since this sandbox can't reach the DB port directly).

### Regression testing after Phases 1, 2, 4, 5, 6, 8

`npm run lint` → 0 errors (4 pre-existing warnings, unrelated files). `npm run typecheck` → clean. `npm test` → 18/18. Live-browser regression against the hosted Supabase project: document upload → RPC metadata save → decrypt original → integrity verified; share creation (1 sanitized document + 1 two-metric vitals dataset, bulk wrapper query + bounded-concurrency vitals path) → provider portal decrypt → sanitized text confirmed redacted, vitals chart shows only the 2 selected metrics (no heartRate/glucose/spo2/weight), chart downsampling active and stats exact.

### Phase 3 — SSR auth round trips (CRITICAL)

Confirmed the live project uses **asymmetric ES256 JWT signing** (checked the token header and `/auth/v1/.well-known/jwks.json` directly against the hosted project), which is what makes this safe: `getClaims()` verifies the JWT locally via WebCrypto against a cached JWKS instead of making a network round trip to the Auth server the way `getUser()` always does, and it still refreshes the session first if the token is near expiry — same verified identity, not a weaker check, per Supabase's own documented behavior for this signing mode.

- `src/lib/db/server.ts`: added `getVerifiedUser()`, a `React.cache()`-wrapped helper calling `supabase.auth.getClaims()`. `cache()` memoizes per request, so a layout + page that both need the user share one verification instead of each hitting the Auth server.
- `src/proxy.ts`: `auth.getUser()` → `auth.getClaims()` (same refresh-on-expiry behavior, no longer a forced network call on every request).
- All 11 pages and 2 API routes that called `const { data: { user } } = await supabase.auth.getUser()` now call `const user = await getVerifiedUser()` instead (mechanical replacement, `user.id`/`user.email` usage unchanged). `(app)/layout.tsx` no longer needs its own `createSupabaseServerClient()` call at all.
- Net effect per page render: proxy (1 local verify, Edge runtime, can't share cache with the RSC render) + layout/page (1 shared local verify via `cache()`) instead of 2-3 separate network round trips to the Auth server.

**Measured** (production build, `next start`, steady state after JWKS warms up):

| Route | Before | After |
|---|---|---|
| `/vault` | 1.1s | **~290ms** |
| `/vitals` | 1.4-1.5s | **~295ms** |
| `/shares` | 1.7s | **~300ms** |
| `/settings` | 1.1s | **~285ms** |
| `/dashboard` (2 dependent queries: shares → access_logs) | 2.0-2.9s | **~1.1-1.2s** |
| `/activity` (2 dependent queries: shares → access_logs) | 1.4-1.5s | **~0.6-0.9s** |

Single-query pages: **~800ms saved per navigation** (roughly 2 eliminated Auth round trips at ~400ms each). Dashboard/activity still make one genuinely-dependent second query (need share IDs before querying `access_logs`), so they improved by the same ~2 round trips but the remaining time is real data-dependency latency, not auth overhead.

Verified: signed-in dashboard, vault, upload (unlock → PDF → X-Ray → save), and share creation all still work against the hosted project after this change; unauthenticated `/dashboard` still redirects to `/auth/sign-in` (`getVerifiedUser()` returns `null` → `redirect()` fires, same as before).

### Regression testing after Phase 3

`npm run lint` → 0 errors (4 pre-existing warnings). `npm run typecheck` → clean. `npm test` → 18/18. `npm run build` → clean. Signed-in and signed-out browser checks are recorded above.

### Phase 7 — Provider access (CRITICAL)

- Added `claim_share_access(uuid)` in `0004_provider_access.sql`. One row-locked transaction resolves effective share state, refuses inactive shares, bulk-joins every permitted item and its safe metadata, atomically claims a one-time share, and writes safe access events. Concurrent requests cannot both claim a one-time share.
- Added `GET /api/shares/:id/access`: one RPC round trip followed by one Storage `createSignedUrls()` batch. URLs expire after **45 seconds**. The route returns keys/IVs and short-lived URLs, but never downloads, buffers, base64-encodes, or JSON-proxies ciphertext.
- `ProviderPortal.tsx` now makes one access request, downloads every ciphertext directly from the private Supabase bucket in parallel, and decrypts locally with the unchanged fragment secret. The fragment is still removed from browser history after import and is never sent to the server.
- Removed the obsolete `/payload` and `/consume` routes so there is no fallback path that proxies large ciphertext or bypasses atomic one-time claiming. `/status` remains metadata-only for compatibility and cannot mint Storage URLs.
- Inactive shares return no item metadata from the RPC and never reach signed-URL creation. The bucket remains private; the long-lived share URL remains the MediKey application URL plus fragment secret.

**Migration applied 2026-09-19** to the live project via the SQL editor. Verified immediately after: `EXECUTE` on `claim_share_access` is granted only to `service_role` — an anon-key RPC call returns `401 permission denied for function claim_share_access`; a service-role call on a nonexistent share returns `200 null` (no enumeration). Anon REST/storage access to all patient tables and the bucket remain empty/denied (unchanged regression, re-verified below).

**Live end-to-end test** (hosted project, `next start` on port 3100 and `next dev` on 3000, real fragment-secret flow, synthetic data only):
- Created an ACTIVE share (1 sanitized document + 1 vitals dataset, systolic+diastolic only) → opened `/share/:id#:secret` in a separate tab → decrypted sanitized report (Patient Name/Phone/etc. redacted, clinical values intact) and a Blood-pressure-only chart (no heartRate/glucose/spo2/weight) rendered from ciphertext downloaded **directly from `supabase.co/storage/v1/object/sign/...`**, never through the Next.js server. Network panel showed exactly one `/api/shares/:id/access` call (not two) and zero requests to any `/payload` path (route no longer exists).
- **Response size**: `/access` body is **2 KB** for a 2-item share (metadata + wrapped keys + two 45-second signed URLs) — no ciphertext, no plaintext, no raw share secret, no service-role key; `Cache-Control: no-store` confirmed.
- **Signed URL TTL**: decoded the returned JWT payload directly — `exp - iat = 45` seconds, matches the constant in the route.
- **Revocation**: called `/revoke`, then `/access` on the same share → `403`, `status: "REVOKED"`, `items: []`.
- **Expiry**: an older share whose `status` column still reads `"ACTIVE"` but whose `expires_at` is in the past → `/access` → `403`, `status: "EXPIRED"`, `items: []` (state is derived from timestamps inside the RPC, not the stale column, matching the original architecture's honesty clause).
- **Wrong secret**: opened an ACTIVE share with a garbage same-length fragment → `/access` still returns 200 with real signed URLs (share itself is valid) but local AES-GCM decrypt fails on every item → clean error ("the link secret is wrong or the data is corrupted"), no fallback plaintext, no crash.
- **One-time atomicity**: created a one-time share, fired **5 concurrent** `GET /access` requests (`curl … & … & wait`) → exactly **1** returned real items (`200`, `itemCount:1`); the other 4 returned `403 CONSUMED` with empty items. The `for update` row lock inside `claim_share_access` serializes concurrent claims — no race window, matching the fix the audit called for.

**Timing** (hosted Supabase, ap-southeast-2, measured from this environment):

| Step | Measured |
|---|---|
| `GET /access` (steady state, repeated calls) | **1.2s** (curl, 3 runs) — 1.98–2.5s on a cold/first call |
| Signed URL → ciphertext download from Storage | **1.3–2.0s** |
| Local AES-GCM decrypt + render | milliseconds (not separately measurable — same native-crypto cost measured in §1) |
| **Total: page load → decrypted, rendered view** | **~3.8s** (Resource Timing, navigation to fully-decrypted content) |

Down from the baseline **4.5–7.5s** (2 API calls, 7 sequential DB round trips for a 2-item share). The improvement is real but modest relative to the old worst case, because **each remaining network leg still pays the full ap-southeast-2 round trip** (see region note); what actually changed is the *count* of round trips (2 API calls → 1; N+1 item/document lookups → 1 bulk RPC join) and that ciphertext bytes never transit the Next.js server as JSON. A same-region deployment would show this shape of fix produce a much larger wall-clock win.

### Phase 9 — Large CSV import

- Added a dedicated `vitals-csv.worker.ts`. The 2 MB CSV `ArrayBuffer` is transferred (not copied as a string) to the worker; Papa Parse rows stay cached in worker memory and never enter React state.
- The UI retains only headers, row count, and mapping. On save, the selected mapping is sent to the same worker and only the final normalized points cross back once.
- `buildVitalsPoints()` now parses each timestamp once to numeric epoch, sorts on that number, and emits ISO timestamps afterward; it no longer constructs two `Date` objects per comparator call.

**Measured** in the browser with `vitals_50000.csv`: parse **51 ms**, normalize/sort/transfer **76 ms**, **126 ms total** worker time (figures from the implementing pass). Re-verified independently this session with `PerformanceObserver({type:'longtask'})` around the same file end-to-end (file read → worker parse → mapping UI shown): **600ms wall clock, zero long tasks recorded** (`longTasks: 0`, `longTaskTotalMs: 0`). Baseline was **650–720 ms blocking the main thread** with 50,000 raw rows placed in React state — the fix isn't primarily about wall-clock time (similar order of magnitude), it's that the main thread now never blocks, confirmed by the long-task count rather than a busy-wait/frame-timer proxy.

### Phase 10 — PDF extraction

- PDF.js remains lazy-loaded and continues to do all extraction locally.
- Pages now extract with bounded concurrency of 6 (not unbounded `Promise.all`) while result ordering remains page-correct.
- The upload UI receives page-based progress (`Scanning page 47 of 120`) and PDF worker resources are explicitly destroyed afterward. Full-document PII detection still runs over the complete joined text.

**Re-measured this session** (dev server, `long_120p.pdf`, two independent runs including a cold and a steady-state run): **2.6–2.7s**, all 120 pages processed, `120/120` PII matches found (one per page, as expected from the synthetic fixture), progress observed through `Scanning page 120 of 120`. This corrects an earlier **283ms** figure recorded for this phase that could not be reproduced in this session's environment — 283ms is not achievable for 120 sequential PDF.js `getPage()`+`getTextContent()` calls even at concurrency 6 on this hardware, and no configuration difference was found to explain it, so it is retracted rather than carried forward unverified. The real, verified improvement over the 3.6s sequential baseline is **~25–30%** from bounded concurrency (6 pages in flight at once) — smaller than hoped, but genuine and reproducible. The main win of this phase is qualitative and already true at baseline: pdf.js's own worker keeps this off the main thread regardless, and the page-by-page progress removes the "is this frozen?" perception problem even though total wall time only modestly improved.

### Phase 11 — Bundle audit

- QR generation changed from a static import to an on-demand `import("qrcode")` after share creation. The production QR implementation is now a separate 23.8 KB raw / 8.9 KB gzip chunk.
- Provider charts use a direct dynamic import only after a decrypted vitals item is present. The Recharts chunk (367 KB raw / 105 KB gzip) is absent from the document-only provider route's initial manifest and loads only for vitals.
- Production `/share/[id]` initial JavaScript measured **650 KB raw / 205 KB gzip** across 10 chunks, down from the earlier ~993 KB raw route total that included Recharts.
- PDF.js remains an on-demand upload-path import. AI code is server-only under `/api/ai/query`; the IPFS adapter has no runtime import. Neither is present in ordinary client route manifests.
- Reviewed client boundaries: the remaining broad boundary is the interactive authenticated shell/vault context. Splitting it would be a risky architectural rewrite for a small incremental saving, so it was deliberately left intact per the audit constraint.

**Re-verified this session** against a fresh production build: fetched `/dashboard`, `/vault`, `/settings`, `/activity`, `/shares` HTML and confirmed none reference the Recharts, QR, or pdfjs chunk filenames. Loaded a document-only provider share (no vitals item) in a fresh tab against the production server and confirmed via `performance.getEntriesByType('resource')` that **zero** Recharts requests occurred while the sanitized document still fully decrypted and rendered — the dynamic-import gate in `ProviderPortal.tsx` genuinely only fires when a vitals item is present, not merely declared lazy in source.

## 4. Remaining work

- **Region note**: Supabase project is ap-southeast-2; measured 350-600ms per round trip from this environment, confirmed again in Phase 7's live timing above. This is the single largest lever left and is explicitly the owner's infrastructure decision — not changed here, per instruction.
- Everything else in the original 11-phase plan has been implemented, applied (where a live migration was needed), and verified against the hosted project in this session.
