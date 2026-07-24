import React, { useRef } from 'react';
import { NativeSyntheticEvent, StyleSheet, TextInput, TextInputKeyPressEventData, View, ViewStyle } from 'react-native';
import { color } from '../tokens/colors';
import { radius, spacing, touchTarget } from '../tokens/spacing';
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
            style={[styles.box, { borderColor: error ? color.state.error : d ? color.border.default : color.border.subtle }, typeScale.title]}
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
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  box: {
    width: touchTarget.preferred,
    height: touchTarget.preferred + 4,
    borderWidth: 1,
    borderRadius: radius.md,
    textAlign: 'center',
    color: color.text.primary,
    backgroundColor: color.brand.cream,
  },
  error: { marginTop: spacing.sm },
});
