import React from 'react';
import { Text as RNText, TextProps, TextStyle } from 'react-native';
import { color } from '../tokens/colors';
import { typeScale, TypeRole } from '../tokens/typography';

type Tone = 'primary' | 'secondary' | 'onMaroon' | 'error' | 'disabled';

const TONE: Record<Tone, string> = {
  primary: color.text.primary,
  secondary: color.text.secondary,
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

/** Editorial heading with an explicit screen-reader header role. */
export function BrandHeading({ children, variant = 'display', tone = 'primary', style, ...rest }: HeadingProps) {
  return (
    <RNText
      {...rest}
      accessibilityRole="header"
      includeFontPadding
      style={[typeScale[variant], { color: TONE[tone] }, style]}
    >
      {children}
    </RNText>
  );
}
