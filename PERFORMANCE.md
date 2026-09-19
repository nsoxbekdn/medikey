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

**Validation status:** lint/typecheck/tests/production build are clean locally. Live latency and decryption measurement is intentionally **not claimed yet**: the migration still has to be run against the hosted Supabase project, and the available dashboard session is signed out. This is the only live validation blocker.

### Phase 9 — Large CSV import

- Added a dedicated `vitals-csv.worker.ts`. The 2 MB CSV `ArrayBuffer` is transferred (not copied as a string) to the worker; Papa Parse rows stay cached in worker memory and never enter React state.
- The UI retains only headers, row count, and mapping. On save, the selected mapping is sent to the same worker and only the final normalized points cross back once.
- `buildVitalsPoints()` now parses each timestamp once to numeric epoch, sorts on that number, and emits ISO timestamps afterward; it no longer constructs two `Date` objects per comparator call.

**Measured** in the browser with `vitals_50000.csv`: parse **51 ms**, normalize/sort/transfer **76 ms**, **126 ms total**; a 16 ms UI timer continued to fire (7 ticks, largest interval **17 ms**). Baseline was **650–720 ms blocking** on the main thread with 50,000 raw rows placed in React state.

### Phase 10 — PDF extraction

- PDF.js remains lazy-loaded and continues to do all extraction locally.
- Pages now extract with bounded concurrency of 6 (not unbounded `Promise.all`) while result ordering remains page-correct.
- The upload UI receives page-based progress (`Scanning page 47 of 120`) and PDF worker resources are explicitly destroyed afterward. Full-document PII detection still runs over the complete joined text.

**Measured** in the browser with `long_120p.pdf`: **3.6 s → 283 ms**, 485,288 extracted characters, final progress `Scanning page 120 of 120`.

### Phase 11 — Bundle audit

- QR generation changed from a static import to an on-demand `import("qrcode")` after share creation. The production QR implementation is now a separate 23.8 KB raw / 8.9 KB gzip chunk.
- Provider charts use a direct dynamic import only after a decrypted vitals item is present. The Recharts chunk (367 KB raw / 105 KB gzip) is absent from the document-only provider route's initial manifest and loads only for vitals.
- Production `/share/[id]` initial JavaScript measured **650 KB raw / 205 KB gzip** across 10 chunks, down from the earlier ~993 KB raw route total that included Recharts.
- PDF.js remains an on-demand upload-path import. AI code is server-only under `/api/ai/query`; the IPFS adapter has no runtime import. Neither is present in ordinary client route manifests.
- Reviewed client boundaries: the remaining broad boundary is the interactive authenticated shell/vault context. Splitting it would be a risky architectural rewrite for a small incremental saving, so it was deliberately left intact per the audit constraint.

## 4. Remaining work (not yet done in this pass)

- Apply `0004_provider_access.sql` to the hosted project, then measure the live provider flow and re-run the document + selective-vitals security regression. The dashboard requires the owner to sign in first; no live improvement is claimed until this is complete.
- **Region note**: Supabase project is ap-southeast-2; measured 350-600ms per round trip from this environment. This is the single largest lever and is explicitly the owner's infrastructure decision, not something changed here.
