/**
 * Values ported from frinq-mobile/src/design/tokens/{colors,spacing}.ts —
 * not the files themselves, since the admin app doesn't carry the mobile
 * brand's fonts (Borel/Vastago Grotesk) and isn't meant to be a full design
 * system port, just enough to render a faithful QuestionPreview. Keep in
 * sync by hand if the mobile palette changes.
 */
export const appColor = {
  maroon: "#621407",
  cream: "#FFFBF7",
  peach: "#FFE8D6",
  brown: "#3C2110",
  brownSecondary: "#5E4636",
  brownDisabled: "#9A8B7E",
  hairline: "rgba(60,33,16,0.15)",
} as const;

export const appSpacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const appRadius = {
  sm: 8,
  md: 12,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;
