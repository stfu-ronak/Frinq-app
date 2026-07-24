import React, { useState } from 'react';
import { StyleSheet, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { color } from '../tokens/colors';
import { radius, spacing, touchTarget } from '../tokens/spacing';
import { typeScale } from '../tokens/typography';
import { BodyText } from './Text';

type Props = Omit<TextInputProps, 'style'> & {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  error?: string | null;
  /** Visually hide the label but keep it for screen readers. */
  hideLabel?: boolean;
  containerStyle?: ViewStyle;
};

/** Labeled text input with an accessible error region. Focus draws a visible
 *  maroon ring; errors set aria state and are announced. */
export function TextField({ label, value, onChangeText, error, hideLabel = false, containerStyle, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? color.state.error : focused ? color.border.focus : color.border.subtle;

  return (
    <View style={[styles.container, containerStyle]}>
      {!hideLabel && (
        <BodyText variant="overline" tone="secondary" style={styles.label}>
          {label.toUpperCase()}
        </BodyText>
      )}
      <TextInput
        {...rest}
        value={value}
        onChangeText={onChangeText}
        onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); rest.onBlur?.(e); }}
        accessibilityLabel={label}
        accessibilityState={{ disabled: rest.editable === false }}
        placeholderTextColor={color.text.disabled}
        style={[styles.input, { borderColor }, typeScale.body]}
      />
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
  label: { marginBottom: spacing.xs },
  input: {
    minHeight: touchTarget.preferred,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    color: color.text.primary,
    backgroundColor: color.brand.cream,
  },
  error: { marginTop: spacing.xs },
});
