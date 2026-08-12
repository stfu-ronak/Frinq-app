import React, { useRef } from 'react';
import { NativeSyntheticEvent, StyleSheet, TextInput, TextInputKeyPressEventData, View, ViewStyle } from 'react-native';
import { color } from '../tokens/colors';
import { radius, spacing } from '../tokens/spacing';
import { typeScale } from '../tokens/typography';
import { BodyText } from './Text';

type Props = {
  value: string;
  onChangeText: (code: string) => void;
  length?: number;
  error?: string | null;
  autoFocus?: boolean;
  containerStyle?: ViewStyle;
};

/** Fixed-length numeric OTP entry rendered as separate boxes with auto-advance
 *  and backspace-to-previous. Exposed to screen readers as one labeled field. */
export function OtpField({ value, onChangeText, length = 6, error, autoFocus, containerStyle }: Props) {
  const refs = useRef<Array<TextInput | null>>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  const setAt = (i: number, ch: string) => {
    const clean = ch.replace(/\D/g, '');
    const next = digits.slice();
    if (clean.length > 1) {
      // paste: distribute across boxes
      const chars = clean.slice(0, length).split('');
      onChangeText(chars.join(''));
      refs.current[Math.min(chars.length, length - 1)]?.focus();
      return;
    }
    next[i] = clean;
    onChangeText(next.join('').slice(0, length));
    if (clean && i < length - 1) refs.current[i + 1]?.focus();
  };

  const onKey = (i: number) => (e: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (e.nativeEvent.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
  };

  return (
    <View style={containerStyle}>
      <View
        style={styles.row}
        accessible
        accessibilityLabel={`Enter the ${length}-digit verification code`}
        accessibilityState={{ disabled: false }}
      >
        {digits.map((d, i) => (
          <TextInput
            key={i}
            ref={(r) => { refs.current[i] = r; }}
            value={d}
            onChangeText={(ch) => setAt(i, ch)}
            onKeyPress={onKey(i)}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            autoFocus={autoFocus && i === 0}
            maxLength={1}
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={[styles.box, { borderColor: error ? color.state.error : d ? color.border.default : color.bg.inputMuted }]}
          />
        ))}
      </View>
      {!!error && (
        <BodyText variant="caption" tone="error" accessibilityLiveRegion="polite" style={styles.error}>
          {error}
        </BodyText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.md },
  box: {
    width: 49,
    height: 49,
    borderWidth: 1,
    borderRadius: radius.md,
    textAlign: 'center',
    textAlignVertical: 'center',
    // Same empty-field caret-placement bug as every other centered TextInput
    // in the app (see NameScreen's input style) — a single digit box is the
    // smallest possible field to show it on.
    writingDirection: 'ltr',
    // Vertical centring in a fixed-height box needs all three of these. An
    // explicit lineHeight (typeScale.title's 34 in a 49px box) and Android's
    // default font padding both bias the glyph upward, and the old
    // `paddingTop: 4` was compensating for that rather than removing it — so
    // the digit still sat high. Take the family/size from the type scale but
    // NOT its lineHeight, drop the inherited padding, and let
    // textAlignVertical do the centring on its own.
    fontFamily: typeScale.title.fontFamily,
    fontSize: typeScale.title.fontSize,
    includeFontPadding: false,
    paddingVertical: 0,
    color: color.text.primary,
    backgroundColor: color.brand.cream,
  },
  error: { marginTop: spacing.sm },
});
