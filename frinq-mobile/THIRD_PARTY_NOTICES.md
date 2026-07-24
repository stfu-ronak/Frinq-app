# Third-Party Notices — Frinq Mobile

Bundled fonts and their licenses. Integrity checksums live in
`src/assets/asset-manifest.json` and are enforced by `scripts/verify-assets.mjs`.

## Borel (display / editorial headings)

Copyright 2023 The Borel Project Authors (https://github.com/RosaWagner/Borel).
Licensed under the **SIL Open Font License, Version 1.1**. The full OFL text
ships upstream at `frinq-frontend/public/fonts/Borel/OFL.txt` and must accompany
any distribution of the Borel font files. Reserved Font Name: "Borel".

Under the OFL: the font may be bundled and redistributed with the application,
may not be sold by itself, and this notice + the license must be retained.

## Vastago Grotesk (body / UI)

Vastago Grotesk is a **commercial typeface**. On **2026-07-23** the product
owner confirmed that the organization purchased Vastago and that its developer
supplied the current font folder specifically for building this application;
Vastago is therefore approved for bundling in `frinq-mobile/`.

Per the standing rules, purchase receipts, order details, license keys, and any
other confidential commercial records are **not** committed to this repository.
If the organization's license requires a specific distributable attribution
string in-app or in store listings, add it here once the owner provides the
exact approved text.

## Notes

- No font is used as a full-screen image; screens are reconstructed natively.
- If a font file changes, update its sha256 in `src/assets/asset-manifest.json`
  in the same change, or `verify-assets` will fail.
