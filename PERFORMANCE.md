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

## 4. Remaining work (not yet done in this pass)

- **Phase 3** (SSR auth: `getClaims()`/shared cached user helper to remove the 2-3 sequential `auth.getUser()` calls per server-rendered page) — highest remaining network win, not yet implemented.
- **Phase 7** (provider access: merge status+payload into one call, bulk item query, short-lived signed Storage URLs instead of base64-in-JSON) — the other CRITICAL item, not yet implemented.
- **Phase 9/10** (CSV Papa worker mode, bounded-concurrency PDF page extraction with progress) — deferred; measured cost (720ms for 50k rows, 3.6s for 120 pages) is real but lower priority than Phases 3/7 per the audit's impact ranking, and 3.6s is off the main thread already (pdf.js worker).
- **Phase 11** (bundle audit after workflow fixes) — not started.
- **Region note**: Supabase project is ap-southeast-2; measured 350-600ms per round trip from this environment. This is the single largest lever and is explicitly the owner's infrastructure decision, not something changed here.
