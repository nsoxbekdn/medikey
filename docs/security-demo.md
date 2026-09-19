# Technical Security Demonstration

This is a developer/judge artifact, intentionally kept out of the patient-facing product. It exists to make the trust boundary concrete, not to make absolute security claims.

**Route**: `/demo-security` (outside the normal app's route group — no sidebar, not linked from Dashboard, Settings, or any customer nav). Gated behind `NEXT_PUBLIC_ENABLE_DEMO_SECURITY_VIEW=true`; disabled by default.

## Scenario

Assume an attacker somehow compromises the storage/database layer — full read access to Postgres and the Storage bucket, no server-side keys.

## What the page shows, using the signed-in account's own data

| Item | Attacker's view |
|---|---|
| Encrypted medical blob | AVAILABLE — real stored ciphertext bytes are fetched via owner-scoped RLS and shown as a hex dump |
| Medical plaintext | UNAVAILABLE — the bytes at that storage path are AES-256-GCM ciphertext |
| Document decryption key | NOT STORED — only wrapped under the owner's vault key, which never leaves the browser unencrypted |
| Share secret | NOT STORED — it lives only in the URL fragment (`#...`) of a share link, which browsers never send to any server |

## What this does and does not claim

- Does **not** claim "unhackable", "impossible to breach", or "100% secure".
- Does claim: stored medical content remains ciphertext even under full database + storage compromise, because the decryption keys are never held server-side in usable form.
- Uses the demo account's own synthetic data, never real patient data.

See [README → Security limitations](../README.md#security-limitations) for the full threat model, including what this demo does *not* cover (e.g. a compromised client, a malicious browser extension, or an attacker who captures the vault passphrase).
