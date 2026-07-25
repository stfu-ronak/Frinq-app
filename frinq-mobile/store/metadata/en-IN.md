# Frinq — Store Listing Metadata (en-IN)

**STATUS: DRAFT — every field below needs explicit owner approval before store submission.**
Same treatment as Task 24's placeholder legal copy: the mechanism (this file, `verify-store-assets.mjs`)
is fully built and exercisable now; the actual copy needs a real sign-off pass, not a guess treated as
final. Values below are reasonable defaults inferred from the shipped app and existing code (splash
copy, support email already live in `SupportScreen.tsx`, phone/OTP/NCR-zone signals throughout the
quiz), not invented from nothing.

## Identity

| Field | Draft value | Source / reasoning |
|---|---|---|
| Product name | Frinq | `strings.xml` / `Info.plist` `CFBundleDisplayName`, already set |
| App ID | `in.frinq.app` | Locked since Phase 7, verified by `verify-native-config.mjs` |
| Subtitle (App Store, ≤30 chars) | "a quiet experiment in friendship" | Splash screen's own copy (`landing`), already user-facing |
| Short description (Play, ≤80 chars) | "Ten quiet minutes. Find the people who already get you." | Splash screen's own copy, trimmed to fit |
| Primary category | Social Networking (App Store) / Social (Play) | Best fit: AI-matched community + real-time chat, not dating/utility |
| Secondary category | Lifestyle | Reasonable secondary; owner may prefer none |
| Copyright | © 2026 **[legal entity name — PLACEHOLDER, owner to supply]** | Not present anywhere in the repo; do not guess a company name |
| Seller / developer name (store-facing) | **[PLACEHOLDER — owner to supply]** | Same — this is the legal entity that appears on the store listing, not invented here |
| Support email | support@frinq.in | Already live in `SupportScreen.tsx`/`support/page.tsx`, real placeholder address the app itself already shows users |
| Support URL | https://frinq.in/support | `WEB_BASE_URL` + the existing `/support` route |
| Privacy policy URL | https://frinq.in/privacy | Existing route, currently DRAFT legal copy (Task 24) |
| Marketing/terms URL | https://frinq.in/terms | Existing route, currently DRAFT legal copy (Task 24) |

## Long description (draft)

> Frinq is a quiet experiment in friendship. Answer a short, honest quiz — about ten minutes — and
> we read the gaps between your answers to place you in a small community of people who already get
> you. No swiping, no profiles to perform for, no matching on looks. Just real-time conversation with
> people who share your actual wavelength.
>
> - A ten-minute quiz, including a couple of spoken-answer questions if you'd rather talk than type
> - A personal "Vibe" report — your archetype, what makes you tick, and a shareable card
> - A small, ongoing community chat with people who scored close to you
> - Report/block/mute tools built in from day one
> - Your data, your account, delete anytime

Needs a real copy pass (tone, length limits per store, ASO keyword research) before submission — this
is a functional draft, not final marketing copy.

## What's explicitly NOT in scope for this listing

Dating/matching mechanics, DMs, photo/media sharing, location-based matching — all excluded per the
design spec's own exclusion list (see `docs/route-parity-matrix.md`'s Conventions section). Don't let
store copy imply any of these exist.
