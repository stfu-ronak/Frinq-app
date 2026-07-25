# Frinq — Territory & Export Compliance Review

**STATUS: DRAFT — territory/market expansion is a business decision, not one to invent here.** This
is a reasoned recommendation from the product's own existing signals, for the owner to confirm or
override before submission — not a legal opinion.

## Recommended initial territory: India only

Every product signal already in the shipped app points at an India-only launch, not a guess:

- OTP delivery is Twilio Verify to WhatsApp/SMS with every test/seed phone number in the codebase in
  `+91XXXXXXXXXX` format (10-digit Indian mobile numbers).
- The quiz collects an `ncr_zone` field (National Capital Region — a India-specific geography with no
  meaning elsewhere).
- The production domain is `frinq.in` (an India ccTLD), not a `.com`/generic TLD.
- Support/legal copy (`support@frinq.in`, `docs/route-parity-matrix.md`'s public-web section) has no
  multi-locale or multi-currency handling anywhere — one language (English), one timestamp format
  (`en-IN` used explicitly in `CommunityMessage.tsx`'s `toLocaleTimeString`), one region.
- Community placement logic groups users by quiz-archetype similarity, not by geography, but the
  *population* it draws from (via WhatsApp OTP reach) is realistically India-only at this stage.

**Recommendation:** submit to the Play Console / App Store Connect territory list as **India only**
for the initial release. Expanding later needs real product decisions this review doesn't make on its
own — multi-language legal copy (Task 24's placeholder is English-only), a phone-number format beyond
the current 10-digit assumption (`PhoneField.tsx` strips non-digits and caps at 10 — a real code change,
not just a store-listing change), and WhatsApp/SMS OTP delivery coverage in the target country.

## Export compliance (encryption)

The app uses only:
- Standard HTTPS/TLS for all network transport (no custom transport-layer cryptography).
- Standard OS-provided encryption for local storage (iOS Keychain, Android Keystore-backed
  `react-native-keychain`; AES-256 via a CSPRNG-generated key held in the platform keystore for the
  encrypted MMKV quiz-draft store — the same category of "standard, exempt" encryption, not a custom
  cipher).

Both qualify for Apple's and Google's export-compliance exemption for apps using only standard,
publicly available encryption. `Info.plist` already declares `ITSAppUsesNonExemptEncryption = false`
(added this task). Play Console's equivalent declaration should match: no proprietary encryption, no
annual self-classification report needed. Revisit this section specifically if end-to-end message
encryption or any custom cryptographic protocol is ever added to community chat — that would change
this answer.

## What this review does NOT decide

Pricing/monetization territory restrictions, App Store/Play Store age-rating specifics per territory,
and any sanctions/export-control screening beyond the standard encryption exemption above — all
business/legal calls for the owner, not inferred from code.
