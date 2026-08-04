/**
 * The ONLY file allowed to contain raw brand hex values. Screens and
 * components consume the semantic `color` tokens below — never raw hex, and
 * never arbitrary brand colors passed as props (primitives expose semantic
 * state instead). Enforced by src/design/__tests__/tokens.test.ts.
 *
 * Approved palette (2026-07-27 design spec, frinq-mobile/Public/Frinq-app.txt):
 *   maroon #621407 · gray #545454 · white/cream #FFFBF7 · peach #FFE8D6 · brown #3C2110
 * `cream` is the txt spec's "white" — kept under its existing name (a rename
 * would touch every consumer for zero behavioral gain), not a second color.
 */
export const palette = {
  maroon: '#621407',
  cream: '#FFFBF7',
  peach: '#FFE8D6',
  brown: '#3C2110',
  gray: '#545454',
  fieldMuted: '#ECECEC', // Figma's neutral country-code fill and inactive OTP outline
  // Supporting shades derived for accessible text/state on the palette above.
  brownSecondary: '#5E4636', // secondary text on cream (>= 4.5:1)
  brownDisabled: '#9A8B7E', // disabled text/'-on-cream (>= 3:1, non-text)
  hairline: 'rgba(60,33,16,0.15)', // subtle brown border
  pillOutline: 'rgba(98,20,7,0.58)', // faded maroon border, plain-pill MCQ options (Figma "Frame 409")
  pillLabel: 'rgba(60,33,16,0.58)', // faded brown label text, same plain-pill options
  errorRed: '#8B1E1E',
  // Summary/vibe-report palette (Figma "summary-v2" set) — the deck's cards
  // and the envelope reveal use warmer, deeper reds than the quiz chrome.
  summaryCardBg: '#82201F', // deck card body
  summaryCardLabel: '#FFCEAD', // peach eyebrow label + share glyph on a card
  summarySheen: '#7C1C0B', // radial highlight over the card body
  summaryDotIdle: 'rgba(98,20,7,0.25)', // inactive deck pagination dot
  summaryQuoteWash: 'rgba(98,20,7,0.05)', // tint behind the pull-quote block
  summarySealRed: '#86201B', // wax seal fill
  envelopePaper: '#E6E0D5', // envelope side flaps
  envelopePaperDeep: '#D9D0C2', // envelope bottom flap (darkest crease)
  envelopePaperLight: '#FBF9F5', // top flap highlight
  envelopeBack: '#ECE7DE', // envelope interior/back wall
  envelopeGlow: '#FFEFA0', // warm light spilling from the opened neck
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
    inputMuted: palette.fieldMuted,
  },
  text: {
    primary: palette.brown, // on cream/peach
    secondary: palette.brownSecondary,
    muted: palette.gray, // de-emphasized captions (new design spec)
    onMaroon: palette.cream, // on milestone/maroon surfaces
    onPeach: palette.brown,
    disabled: palette.brownDisabled,
    error: palette.errorRed,
    pillLabel: palette.pillLabel,
  },
  border: {
    default: palette.maroon, // thin maroon outlines
    subtle: palette.hairline,
    focus: palette.maroon, // visible focus ring
    pill: palette.pillOutline,
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
  /** Vibe-report summary screen: the card deck and the envelope reveal. */
  summary: {
    cardBg: palette.summaryCardBg,
    cardLabel: palette.summaryCardLabel,
    sheen: palette.summarySheen,
    dotIdle: palette.summaryDotIdle,
    quoteWash: palette.summaryQuoteWash,
    sealRed: palette.summarySealRed,
    envelopePaper: palette.envelopePaper,
    envelopePaperDeep: palette.envelopePaperDeep,
    envelopePaperLight: palette.envelopePaperLight,
    envelopeBack: palette.envelopeBack,
    envelopeGlow: palette.envelopeGlow,
  },
} as const;

export type ColorTokens = typeof color;
