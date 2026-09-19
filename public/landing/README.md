# Landing image assets

`medikey-dashboard.webp` is a cropped capture of the real authenticated MediKey dashboard populated only with synthetic demo records. It is intentionally static so the public landing page does not import dashboard, charting, QR, PDF, or encryption runtimes.

To refresh it after a dashboard redesign:

1. Sign in with a synthetic demo account and unlock the demo vault.
2. Populate Recent records and Blood pressure with the files in `public/demo/`.
3. Capture the dashboard at desktop width with browser chrome excluded.
4. Crop to the application surface, remove any real personal information, export as WebP, and replace `medikey-dashboard.webp` without changing its public path.

`clinician-tablet.webp` is a locally generated editorial image used only by the public landing page.
