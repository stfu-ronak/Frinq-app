import React from 'react';
import { Text as RNText, TextProps, TextStyle, View, ViewStyle } from 'react-native';
import { color } from '../tokens/colors';
import { typeScale, TypeRole } from '../tokens/typography';

type Tone = 'primary' | 'secondary' | 'muted' | 'brand' | 'onMaroon' | 'error' | 'disabled';

const TONE: Record<Tone, string> = {
  primary: color.text.primary,
  secondary: color.text.secondary,
  muted: color.text.muted,
  brand: color.brand.maroon,
  onMaroon: color.text.onMaroon,
  error: color.text.error,
  disabled: color.text.disabled,
};

// Note: the prop is `variant`, not `role` — React Native's TextProps already
// defines an ARIA `role`, and intersecting it with our type-scale union would
// collapse to their only shared member ("heading").
type BodyProps = TextProps & {
  children: React.ReactNode;
  variant?: TypeRole;
  tone?: Tone;
  style?: TextStyle;
};

/** Vastago body/UI text. Variant picks family+size+lineHeight; tone picks an
 *  accessible color token. Never accepts a raw color. */
export function BodyText({ children, variant = 'body', tone = 'primary', style, ...rest }: BodyProps) {
  return (
    <RNText {...rest} style={[typeScale[variant], { color: TONE[tone] }, style]}>
      {children}
    </RNText>
  );
}

type HeadingProps = TextProps & {
  children: React.ReactNode;
  /** display = Borel; title/heading = Vastago semibold. */
  variant?: Extract<TypeRole, 'display' | 'title' | 'heading'>;
  tone?: Tone;
  style?: TextStyle;
};

/**
 * Shared size/alignment for a full-width quiz-question prompt (the big Borel
 * heading on MCQ-style screens: single/multi-choice, cards, tags). Every
 * template using this exact prompt shape should spread this instead of
 * re-declaring fontSize/lineHeight inline — that copy-paste is exactly what
 * let SingleChoiceList/Card/MultiChoiceTags drift to three different
 * marginBottom values with the same 32/48 size in the first place. Templates
 * with a genuinely different prompt shape (Voice/Text's longer sentences,
 * SnapSlider's first-person statements) still use BrandHeading directly with
 * their own smaller size — that's a deliberate content-length call, not
 * drift, and doesn't affect the starting position (BrandHeading's own
 * paddingTop above is what aligns every screen's start, not the font size).
 */
export const questionHeadingStyle: TextStyle = { fontSize: 32, lineHeight: 48, textAlign: 'center' };

/** Lines the prompt slot reserves, and the total height that comes out of it
 *  (lines + BrandHeading's own 8/4 padding + the gap down to the options).
 *  This is the whole point of QuestionHeading: the slot's height is FIXED, so
 *  option 1 lands on the same Y whether the question runs to one line or four,
 *  and options 2..n follow at the same pitch from there. */
// 3, not 4: no prompt in the current set needs a fourth line, and reserving
// one cost ~48dp of every question screen — on the tag questions that pushed
// the options into a strip at the bottom.
const QUESTION_HEADING_LINES = 3;
const QUESTION_HEADING_GAP = 24;
export const QUESTION_HEADING_SLOT_H =
  QUESTION_HEADING_LINES * (questionHeadingStyle.lineHeight as number) + 12 + QUESTION_HEADING_GAP;

/** The prompt on every MCQ-style question screen (single-choice list/card,
 *  multi-choice tags, opinions). Use this rather than a bare BrandHeading +
 *  your own marginBottom — the four templates each had a different margin,
 *  which is what made the first option sit at a different height page to page.
 *  `children` is the prompt; `extra` is optional supporting copy that belongs
 *  INSIDE the reserved slot (tag questions' subtext) so it can't push the
 *  options down either. */
export function QuestionHeading({ children, extra, testID, fluid = false }: { children: React.ReactNode; extra?: React.ReactNode; testID?: string; fluid?: boolean }) {
  return (
    <View testID={testID} style={fluid ? questionHeadingFluid : questionHeadingSlot}>
      <BrandHeading
        variant="display"
        tone="brand"
        numberOfLines={QUESTION_HEADING_LINES}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        style={questionHeadingStyle}
      >
        {children}
      </BrandHeading>
      {extra}
    </View>
  );
}

const questionHeadingSlot: ViewStyle = {
  height: QUESTION_HEADING_SLOT_H,
  width: '100%',
  justifyContent: 'flex-start',
};

/** `fluid`: height follows the prompt, with the same gap below it.
 *
 *  The fixed slot exists so option 1 lands on the same Y across the PICK-ONE
 *  pages. A multi-answer page has no such contract — its content starts right
 *  under the question — and reserving three lines there just opened a big
 *  empty band between a one-line prompt and the field beneath it. */
const questionHeadingFluid: ViewStyle = {
  width: '100%',
  paddingBottom: QUESTION_HEADING_GAP,
};

/** Editorial heading with an explicit screen-reader header role. */
export function BrandHeading({ children, variant = 'display', tone = 'primary', style, ...rest }: HeadingProps) {
  return (
    <RNText
      {...rest}
      accessibilityRole="header"
      style={[typeScale[variant], { color: TONE[tone], includeFontPadding: true, paddingTop: 8, paddingBottom: 4 }, style]}
    >
      {children}
    </RNText>
  );
}
