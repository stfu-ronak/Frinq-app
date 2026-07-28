/**
 * Type roles. Borel = expressive display/editorial headings; Vastago Grotesk =
 * all body/UI/controls (organization-licensed, owner-confirmed 2026-07-23).
 *
 * Family names are the values React Native resolves after the fonts are linked
 * in Task 27 Step 2 (iOS PostScript name / Android file name). Vastago weights
 * are separate files, so weight is selected by family, not fontWeight.
 */
export const fontFamily = {
  display: 'Borel-Regular',
  bodyThin: 'VastagoGrotesk-Thin',
  bodyLight: 'VastagoGrotesk-Light',
  body: 'VastagoGrotesk-Regular',
  bodyMedium: 'VastagoGrotesk-Medium',
  bodySemiBold: 'VastagoGrotesk-SemiBold',
  bodyBold: 'VastagoGrotesk-Bold',
} as const;

/** role -> { fontFamily, fontSize, lineHeight }. Line heights are generous for
 *  Dynamic Type / font-scaling headroom (accessibility wins over density). */
export const typeScale = {
  display: { fontFamily: fontFamily.display, fontSize: 40, lineHeight: 58 },
  title: { fontFamily: fontFamily.bodySemiBold, fontSize: 28, lineHeight: 34 },
  heading: { fontFamily: fontFamily.bodySemiBold, fontSize: 22, lineHeight: 28 },
  subheading: { fontFamily: fontFamily.bodyMedium, fontSize: 18, lineHeight: 24 },
  body: { fontFamily: fontFamily.body, fontSize: 16, lineHeight: 24 },
  bodyStrong: { fontFamily: fontFamily.bodySemiBold, fontSize: 16, lineHeight: 24 },
  caption: { fontFamily: fontFamily.body, fontSize: 13, lineHeight: 18 },
  overline: { fontFamily: fontFamily.bodyMedium, fontSize: 11, lineHeight: 16 },
} as const;

export type TypeRole = keyof typeof typeScale;
