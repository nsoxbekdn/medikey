# BUILD_STATUS

Last verified: 2026-09-19 · `npm run lint` ✅ (4 cosmetic warnings) · `npm run typecheck` ✅ · `npm test` ✅ 18/18 · `npm run build` ✅ · live flow verified in browser against hosted Supabase.

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

## Next task

Add the AI Copilot UI (`/vault/[id]` → "Explain this report") with the sanitized-preview confirmation step, wired to the existing `/api/ai/query`.
