import React from 'react';
import { StyleSheet, TextInput, View, ViewStyle } from 'react-native';
import { color } from '../tokens/colors';
import { radius, spacing, touchTarget } from '../tokens/spacing';
import { typeScale } from '../tokens/typography';
import { BodyText } from './Text';

type Props = {
  value: string;
  onChangeText: (digits: string) => void;
  error?: string | null;
  /** Dial-code prefix shown inline (default +91, India). */
  dialCode?: string;
  autoFocus?: boolean;
  containerStyle?: ViewStyle;
};

/** Phone entry with an inline dial-code prefix. Strips non-digits and caps at
 *  10 digits; the prefix is decorative and hidden from accessibility. */
export function PhoneField({ value, onChangeText, error, dialCode = '+91', autoFocus, containerStyle }: Props) {
  return (
    <View style={[styles.container, containerStyle]}>
      <View style={[styles.row, { borderColor: error ? color.state.error : color.border.subtle }]}>
        <BodyText
          variant="subheading"
          tone="primary"
          style={styles.prefix}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {dialCode}
        </BodyText>
        <TextInput
          value={value}
          onChangeText={(t) => onChangeText(t.replace(/\D/g, '').slice(0, 10))}
          keyboardType="number-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          autoFocus={autoFocus}
          maxLength={10}
          accessibilityLabel="Phone number"
          placeholder="98765 43210"
          placeholderTextColor={color.text.disabled}
          style={[styles.input, typeScale.subheading]}
        />
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
  container: { width: '100%' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: touchTarget.preferred,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: color.brand.cream,
  },
  prefix: { marginRight: spacing.sm },
  input: { flex: 1, color: color.text.primary, paddingVertical: spacing.sm },
  error: { marginTop: spacing.xs },
});
