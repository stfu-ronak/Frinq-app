/**
 * The ONLY file allowed to contain raw brand hex values. Screens and
 * components consume the semantic `color` tokens below — never raw hex, and
 * never arbitrary brand colors passed as props (primitives expose semantic
 * state instead). Enforced by src/design/__tests__/tokens.test.ts.
 *
 * Approved palette (2026-07-23 design spec):
 *   maroon #621507 · cream #FFFBF7 · peach #FFE8D6 · brown #3C2110
 */
export const palette = {
  maroon: '#621507',
  cream: '#FFFBF7',
  peach: '#FFE8D6',
  brown: '#3C2110',
  // Supporting shades derived for accessible text/state on the palette above.
  brownSecondary: '#5E4636', // secondary text on cream (>= 4.5:1)
  brownDisabled: '#9A8B7E', // disabled text/'-on-cream (>= 3:1, non-text)
  hairline: 'rgba(60,33,16,0.15)', // subtle brown border
  errorRed: '#8B1E1E',
  successGreen: '#2E5D34',
  white: '#FFFFFF',
  scrim: 'rgba(60,33,16,0.45)', // modal backdrop
} as const;

export const color = {
  brand: {
    maroon: palette.maroon,
    cream: palette.cream,
    peach: palette.peach,
    brown: palette.brown,
  },
  bg: {
    canvas: palette.cream, // default screen background
    surface: palette.peach, // action/card surfaces
    milestone: palette.maroon, // full-screen milestone states
    scrim: palette.scrim,
  },
  text: {
    primary: palette.brown, // on cream/peach
    secondary: palette.brownSecondary,
    onMaroon: palette.cream, // on milestone/maroon surfaces
    onPeach: palette.brown,
    disabled: palette.brownDisabled,
    error: palette.errorRed,
  },
  border: {
    default: palette.maroon, // thin maroon outlines
    subtle: palette.hairline,
    focus: palette.maroon, // visible focus ring
  },
  state: {
    selected: palette.maroon,
    error: palette.errorRed,
    success: palette.successGreen,
    ownershipAccent: palette.maroon, // current-user accent in chat (restrained)
  },
  control: {
    primaryBg: palette.maroon,
    primaryText: palette.cream,
    secondaryBg: palette.peach,
    secondaryText: palette.brown,
    disabledBg: palette.hairline,
  },
} as const;

export type ColorTokens = typeof color;
