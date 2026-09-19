# MediKey — 3-minute demo script

Prep: signed-in patient with an unlocked vault in tab A; a second browser/incognito window ready for tab B. Demo files in `public/demo/`.

| Time | Screen | Say / do |
|---|---|---|
| 0:00–0:15 | `/dashboard` | "Medical data is fragmented, sensitive, and stored in systems patients don't control. MediKey flips that: the server only ever holds ciphertext." |
| 0:15–0:45 | `/upload` → pick `sample_lab_report.txt` | Privacy X-Ray: "10 identifiers detected, exposure 100/100 — parsed and scanned in this browser, nothing uploaded yet." Untick nothing (or untick 'Address' to show override). Point at the sanitized preview: name/phone/IDs gone, HbA1c 7.4 % intact. |
| 0:45–1:00 | click **Encrypt & save** → `/vault/[id]` | "Fresh AES-GCM key per document, SHA-256 integrity hash. Decrypt original → 'SHA-256 verified'." |
| 1:00–1:20 | `/vitals/import` → `vitals_demo.csv` | Auto-mapped headers. Save → systolic/diastolic chart, latest/min/max/avg. "Encrypted before it leaves the browser." |
| 1:20–1:45 | `/shares/new` | Recipient "Dr. Mehta", purpose "Second opinion". Choose **Sanitized** report + **systolic, diastolic only**. Privacy label shows *Direct identifiers: None*. Duration **10 minutes**. Create → QR + link. "The secret after `#` never reaches the server." |
| 1:45–2:10 | tab B: open the link | Countdown, READ ONLY badge, sanitized report, BP chart only — no glucose/weight. "Decrypted inside this browser." |
| 2:10–2:30 | tab A `/shares` → **Revoke Access**; tab B refresh | **ACCESS REVOKED**. "The API returned 403 — it's enforced server-side, not hidden in the UI." |
| 2:30–2:45 | `/demo/security` | "This is what a full DB + storage breach exposes: an opaque path, a hash, 32 bytes of ciphertext. No plaintext, no keys, no share secret." |
| 2:45–3:00 | README architecture | "Same pattern extends to sanitized-RAG AI and encrypted IPFS. MediKey doesn't just protect a file — it lets the patient control what is shared, with whom, for what purpose, and for how long." |

Backup: `/activity` shows the full audit timeline if a step is questioned.
