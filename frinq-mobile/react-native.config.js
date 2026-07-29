/**
 * Bundles the licensed fonts into the native projects. This is NOT picked up
 * automatically by a gradle/xcode build — you MUST run `npm run link-fonts`
 * (wraps `react-native-asset`) after adding/changing any file in
 * src/assets/fonts, or the app silently falls back to the system font with
 * no error (confirmed the hard way: Borel/Vastago/Urbanist were never
 * actually linked into android/app/src/main/assets/fonts until this was run
 * once — every screen had been rendering with the system font before that).
 * Fonts: Borel (OFL) + Vastago Grotesk (organization-licensed, owner-supplied
 * 2026-07-23) + Urbanist (OFL, added 2026-07-27). See THIRD_PARTY_NOTICES.md
 * and src/assets/asset-manifest.json.
 */
module.exports = {
  project: {
    ios: {},
    android: {},
  },
  assets: ['./src/assets/fonts'],
};
