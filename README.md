# MediKey — Zero-Trust Medical Record Aggregator

> **Your records. Your keys. Your control.**

MediKey lets a patient aggregate fragmented medical records, strip personally identifiable information locally, encrypt everything in the browser, visualise longitudinal vitals, and share exactly what a doctor needs — for exactly as long as they need it. The storage/API layer never sees plaintext medical records or plaintext decryption keys.

This is a hackathon implementation of a zero-trust-inspired architecture. It is **not** formally zero-knowledge, HIPAA-certified, or medically validated. See [Security limitations](#security-limitations).

---

## Problem

Medical data is fragmented across labs, hospitals and wearables, is deeply sensitive, and normally lives in systems the patient does not control. Sharing usually means emailing a full PDF — with name, phone, ID numbers — to a provider who then keeps it forever.

## Features

| Feature | Status |
|---|---|
| Account auth (Supabase) + separate client-side crypto vault | ✅ |
| Browser-generated AES-GCM-256 root key + ECDH P-256 keypair, wrapped with PBKDF2-derived KEK | ✅ |
| Document vault: PDF / TXT / CSV / JPG / PNG, parsed locally (PDF.js) | ✅ |
| Local OCR fallback for scanned/image-only documents (Tesseract.js, in-browser) | ✅ |
| Privacy X-Ray: deterministic PII detection, per-item override, exposure indicator | ✅ |
| Sanitized derivative (`[REDACTED]`), verified leak-free before save | ✅ |
| Per-document AES-GCM key, fresh 12-byte IV, SHA-256 integrity (recomputed on decrypt) | ✅ |
| Vitals CSV import, tolerant header mapping, encrypted storage, Recharts dashboard | ✅ |
| Selective disclosure: documents (original / sanitized) + individual vital metrics | ✅ |
| Fragment-secret share links (`/share/<id>#<secret>`), QR generated locally | ✅ |
| Time-bound access (10m / 1h / 24h / 48h / custom), **enforced server-side** | ✅ |
| Manual revocation, one-time access claims | ✅ |
| Read-only provider portal with countdown, local decryption | ✅ |
| Consent receipt, data-sharing "nutrition label" | ✅ |
| Access log timeline (no keys / plaintext ever logged) | ✅ |
| Technical breach demo (feature-flagged; absent from customer navigation) | ✅ |
| Longitudinal health timeline + "what changed" comparison | ✅ |
| AI Health Copilot | 🟡 mock provider + sanitized-RAG scaffolding |
| IPFS storage | 🟡 interface + stub adapter |
| Research mode, emergency card, relationship graph | ⬜ future scope |

---

Born-digital PDFs are parsed locally with PDF.js. Image-based PDFs and supported image files (JPG/PNG) can fall back to local browser OCR with Tesseract.js. Raw medical scans are not sent to a cloud OCR provider — the worker, WASM core and English trained data are served from this app's own origin.

## Architecture

```
+------------------------------------------------------+
|                    PATIENT BROWSER                   |
|  Upload -> PDF/TXT/CSV parse (or local OCR fallback  |
|            for scans/images) -> Privacy X-Ray        |
|         -> sanitized derivative -> SHA-256           |
|         -> AES-GCM-256 (fresh key + IV per document) |
+----|-------------------------------------------------+
     | ciphertext + safe metadata only
     v
+---------------------+        +----------------------+
| Next.js API routes  |        | Supabase             |
| share-state checks  | -----> | Postgres (RLS)       |
| access logging      |        | Storage (private)    |
+----------+----------+        +----------------------+
           |
PROVIDER BROWSER
  /share/<id>#<secret>  -> GET access (expiry/revocation/one-time enforced)
                        -> 45-second private Storage URLs + wrapped keys, or 403
                        -> direct ciphertext download from Supabase
                        -> unwrap with fragment secret, decrypt locally
                        -> read-only view
```

### Trust boundary

**Trusted with plaintext:** the authorized patient's browser memory while a record is open; the provider's browser memory for records the patient chose to share.

**Not trusted with medical plaintext:** the application database, object storage, network intermediaries, logs, analytics, IPFS.

**The backend is allowed to know:** opaque user/document/share IDs, encrypted object paths, ciphertext sizes, SHA-256 digests, timestamps, share state and expiry, safe audit event types, and the patient-typed provider label/purpose.

### Cryptographic design

| Material | Generated | Stored as |
|---|---|---|
| Vault root key (AES-GCM-256) | `crypto.subtle.generateKey` in browser | Wrapped bundle (AES-GCM under PBKDF2-SHA-256 KEK, 210k iterations, random salt) |
| Vault identity keypair (ECDH P-256) | browser | Public JWK plain; private JWK inside the wrapped bundle |
| Document key (AES-GCM-256, one per document) | browser | `document_key_wrappers.wrapped_document_key` (wrapped under root key) |
| Vitals dataset key | browser | `vitals_datasets.wrapped_dataset_key` (wrapped under root key) |
| Share secret (AES-GCM-256) | browser | **Never stored.** Lives only in the URL fragment |
| Share item access key | browser | `share_items.wrapped_access_key` (document/dataset key re-wrapped under the share secret) |

Every AES-GCM call uses a fresh random 12-byte IV stored alongside the ciphertext. Passphrases, raw keys, and share secrets are never logged.

### Share flow

1. Patient selects items and an expiry; browser generates a random share secret.
2. For each document: unwrap its key with the vault root key, re-wrap it under the share secret.
3. For each vitals dataset: decrypt, **filter to the selected metrics only**, re-encrypt with a fresh ephemeral key, upload that new blob, wrap the ephemeral key under the share secret. An unselected metric never reaches the provider even as ciphertext.
4. `POST /api/shares` atomically stores the owner-validated share, items and wrapped keys; logs `SHARE_CREATED`; issues a consent receipt.
5. URL is built as `/share/<id>#<secret>`. The fragment is not sent in HTTP requests.
6. Provider's browser calls `/access`; the server derives effective state from `revoked_at` / `consumed_at` / `expires_at`, prepares 45-second private Storage URLs, atomically claims one-time access, and returns **403** unless ACTIVE.
7. Provider downloads ciphertext directly from private Storage, then unwraps and decrypts locally; Vercel and Supabase never receive medical plaintext.

### Time-bound access semantics

Revocation and expiry block **future retrieval** of encrypted material. They cannot make a provider forget, un-see, screenshot, or delete data already decrypted in their browser. One-time access can be claimed once; the server does not cryptographically prove successful browser decryption before consumption.

### Vitals / time-series

CSV parsed with Papa Parse in the browser. Header aliases: `date|datetime|timestamp|time`, `systolic|sys|sbp`, `diastolic|dia|dbp`, `heart_rate|hr|pulse`, `glucose|blood_glucose`, `spo2|oxygen_saturation`, `weight|body_weight`; a mapping UI covers the rest. Invalid rows are skipped. Charts: BP (systolic + diastolic), heart rate, glucose, SpO2, weight, with latest / min / max / avg / count. No clinical thresholds or diagnoses are shown.

### PII privacy engine

Regex rules (email, Indian mobile, Aadhaar-like 12-digit, dates) plus label-context rules (`Patient Name:`, `Patient ID:`, `MRN:`, `UHID:`, `Registration No:`, `Phone:`, `Email:`, `DOB:`, `Address:`). Overlaps deduped by confidence. The user can untick any item. The **Privacy Exposure Indicator is a weighted heuristic, not an anonymity guarantee**, and detection is not perfect — free-text names without a label will be missed.

### Sanitization limitation

MediKey does **not** draw black boxes over PDFs (that leaves text extractable). It produces a *sanitized derivative*: extracted text with selected spans replaced by `[REDACTED]`, verified to contain none of the removed strings before it is encrypted and saved. The original encrypted file stays in the vault; the patient chooses which artifact to share.

### AI privacy flow

`/api/ai/query` accepts **already-sanitized** text chunks only. `lib/ai/rag.ts` chunks sanitized text and does keyword retrieval. Without `AI_API_KEY` the `MockHealthCopilotProvider` returns a clearly-labelled synthetic answer. No medical text is logged server-side. Real provider adapters plug into `HealthCopilotProvider`.

### IPFS / decentralized storage

`EncryptedBlobStore` interface with `SupabaseEncryptedBlobStore` (live) and `IPFSEncryptedBlobStore` (stub). Rule: only ciphertext may ever be pinned; the CID goes in app metadata; keys never appear in CIDs. Because IPFS content stays retrievable by CID, revocation revokes the **key-wrapping path**, not the ciphertext.

### Database schema

`profiles`, `user_crypto`, `documents`, `document_key_wrappers`, `sanitized_artifacts`, `vitals_datasets`, `shares`, `share_items`, `access_logs`, `consent_receipts`. UUID keys throughout. See `supabase/migrations/0001_init.sql`.

### RLS / security model

Every patient table has RLS with `owner_id = auth.uid()`. There is deliberately **no anonymous SELECT policy** on any table and no anonymous storage policy. Providers never touch the database directly: `/api/shares/[id]/access` uses the service-role key server-side, accepts only an opaque share ID, enforces state, and returns only that share's items. `revoke` requires the owner's session.

---

## Setup

```bash
npm install
cp .env.example .env   # fill in Supabase values
```

Apply all files in `supabase/migrations` in numeric order (Supabase CLI migration push is preferred). In **Authentication → Sign In / Providers → Email**, turn off *Confirm email* only for demo accounts.

### Environment variables

| Var | Scope | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client+server | project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client+server | publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | provider-portal routes, audit writes |
| `AI_PROVIDER`, `AI_API_KEY` | server only | optional; mock used when empty |
| `IPFS_PROVIDER`, `IPFS_API_TOKEN` | server only | optional; stub when empty |
| `NEXT_PUBLIC_ENABLE_DEMO_SECURITY_VIEW` | client | `true` shows `/demo-security` |

### Local development

```bash
npm run dev        # http://localhost:3000
npm run lint
npm run typecheck
npm test           # crypto, PII, share-state tests
npm run build
```

### Deployment

Vercel + hosted Supabase. Set the env vars above in Vercel (service-role and AI keys as non-public). Set `NEXT_PUBLIC_ENABLE_DEMO_SECURITY_VIEW=false` in production unless the breach simulator is wanted.

### Demo data

`public/demo/sample_lab_report.txt` (synthetic report with fake name/DOB/phone/email/IDs + plausible labs) and `public/demo/vitals_demo.csv`. Both are clearly labelled synthetic. Create any account; no seeded credentials.

---

## Security acceptance tests (§67)

| Test | Method | Result |
|---|---|---|
| A ciphertext storage | downloaded stored blob with service key, grepped for plaintext | ✅ 1190 B of random bytes, nothing found |
| B wrong key | tampered fragment secret | ✅ clean error, no plaintext |
| C expired share | set `expires_at` in past while `status` column still ACTIVE | ✅ access 403, UI ACCESS EXPIRED |
| D revoked share | Revoke → provider refresh | ✅ access 403, UI ACCESS REVOKED |
| E PII derivative | `npm test` | ✅ exact expected output, no leakage |
| F share isolation | anon key vs every table + known blob path | ✅ `[]` everywhere, storage 400 |
| G vitals selection | shared systolic+diastolic only | ✅ payload carries 2 metrics; provider renders BP chart only |

## Threat model

**Mitigated / reduced:** database breach, object-storage breach, accidental over-sharing, stale share links, broad provider access, raw PII sent to AI, identifier leakage through sanitized derivatives (verified before save).

**Out of scope / not solved:** compromised patient or provider device, malicious browser extensions, screenshots or copying of viewed data, traffic-analysis metadata, perfect de-identification, formal regulatory compliance, recovery of a forgotten vault passphrase.

## Security Demonstration

A developer/judge-only technical artifact — a simulated server breach against this account's own real ciphertext — is intentionally kept outside the patient-facing product (no sidebar entry, no dashboard/settings link). See [docs/security-demo.md](docs/security-demo.md) for what it shows and what it does not claim.

## Security limitations

- Not formally zero-knowledge: the server knows share metadata, sizes, timestamps and the patient-typed provider label.
- Provider identity is **patient-specified**, not verified. Schema has `provider_verified` / `verification_source` / `verified_at` ready for a real verifier.
- Vault passphrase loss is unrecoverable by design.
- PII detection is heuristic. Review before sharing.
- Dev-only: React StrictMode double-fires effects; the provider portal guards this so logs stay single.

## Medical disclaimer

MediKey organizes and explains user-provided health information. It does not provide diagnosis, treatment, or emergency medical services. AI-generated explanations may be inaccurate and should be reviewed with a qualified healthcare professional.

## Future scope

Real AI provider adapter with per-chunk provenance · IPFS pinning via Pinata/web3.storage · research (de-identified) sharing mode · emergency access card · medical timeline / "what changed" deltas · provider verification service · document relationship graph.

