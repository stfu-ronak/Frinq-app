/**
 * Bundles the licensed fonts into the native projects. Run `npx react-native-asset`
 * (or it is picked up by the build) to copy fonts into android assets and
 * register them in the iOS Info.plist. Fonts: Borel (OFL) + Vastago Grotesk
 * (organization-licensed, owner-supplied 2026-07-23). See THIRD_PARTY_NOTICES.md
 * and src/assets/asset-manifest.json.
 */
module.exports = {
  project: {
    ios: {},
    android: {},
  },
  assets: ['./src/assets/fonts'],
};
