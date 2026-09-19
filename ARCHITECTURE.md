# MediKey Architecture

## Remote Sharing Over the Internet

MediKey sharing is cloud-hosted, not peer-to-peer. The patient and provider may be on unrelated networks in different cities or countries. After share creation, the patient device does not serve the record and may be closed or offline.

1. The patient browser processes, sanitizes, filters, and AES-GCM encrypts records locally.
2. Only ciphertext, wrapped access keys, and safe share metadata are stored in private Supabase Storage and PostgreSQL.
3. The patient sends `https://<deployment>/share/<opaque-id>#<secret>`. The fragment secret is never sent to Vercel or Supabase.
4. `GET /api/shares/:id/access` asks a server-only Supabase RPC to derive the effective share state from revocation, one-time consumption, and expiry timestamps.
5. The backend prepares 45-second signed URLs for only that share's private ciphertext, then atomically claims one-time access. It returns no medical plaintext and performs no decryption.
6. The provider downloads ciphertext directly from Supabase Storage, unwraps item keys with the in-memory fragment key, and decrypts locally in the browser.

Selective vitals shares are separate encrypted payloads containing `timestamp` plus only the selected metrics. Hidden metrics are absent from provider plaintext rather than merely hidden in the chart.

RLS restricts patient tables and Storage paths to their owner. There are no anonymous table or Storage read policies; unauthenticated provider access is mediated only by the controlled server route using the server-only service role.

Revocation and expiry prevent new signed URLs. They cannot erase information a provider already viewed. Storage URL lifetime is deliberately independent of share lifetime and remains 45 seconds.
