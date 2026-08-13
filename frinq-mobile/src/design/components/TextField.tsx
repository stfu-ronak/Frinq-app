import React, { useState } from 'react';
import { StyleSheet, TextInput, TextInputProps, TextStyle, View, ViewStyle } from 'react-native';
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
  /** Extra style for the input itself — e.g. a taller box for a multiline
   *  answer field. Applied last so it can override the variant's own metrics,
   *  but never the focus/error border colour. */
  inputStyle?: TextStyle;
  /** 'boxed' (default): bordered box, cream fill. 'underline': bottom-line
   *  only, transparent — the inline-placeholder look on quiz voice/text
   *  screens. */
  variant?: 'boxed' | 'underline';
};

/** Labeled text input with an accessible error region. Focus draws a visible
 *  maroon ring; errors set aria state and are announced. */
export function TextField({ label, value, onChangeText, error, hideLabel = false, containerStyle, inputStyle, variant = 'boxed', ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? color.state.error : focused ? color.border.focus : color.border.subtle;
  const isUnderline = variant === 'underline';

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
        style={[styles.input, isUnderline ? { ...styles.inputUnderline, borderBottomColor: borderColor } : { borderColor }, typeScale.body, inputStyle]}
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
    backgroundColor: color.bg.box,
  },
  inputUnderline: {
    borderWidth: 0,
    borderBottomWidth: 1,
    borderRadius: 0,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
  },
  error: { marginTop: spacing.xs },
});
