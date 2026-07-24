import React from 'react';
import { ActivityIndicator, StyleSheet, View, ViewStyle } from 'react-native';
import { color } from '../tokens/colors';
import { radius, spacing, touchTarget } from '../tokens/spacing';
import { typeScale } from '../tokens/typography';
import { BodyText } from './Text';
import { PressableScale } from '../motion/PressableScale';

type Props = {
  label: string;
  onPress: () => void;
  /** Secondary = peach surface; primary = maroon fill. */
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  busy?: boolean;
  style?: ViewStyle;
};

/** Filled action button. >=48 dp, exposes disabled/busy accessibility state,
 *  and blocks taps while busy or disabled. */
export function PrimaryButton({ label, onPress, variant = 'primary', disabled = false, busy = false, style }: Props) {
  const inactive = disabled || busy;
  const isPrimary = variant === 'primary';
  const bg = inactive ? color.control.disabledBg : isPrimary ? color.control.primaryBg : color.control.secondaryBg;
  const fg = isPrimary ? color.control.primaryText : color.control.secondaryText;

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      haptic={!inactive}
      style={[styles.base, { backgroundColor: bg }, style]}
    >
      <View style={styles.row}>
        {busy && <ActivityIndicator color={fg} style={styles.spinner} />}
        <BodyText variant="bodyStrong" style={{ color: inactive ? color.text.disabled : fg, ...typeScale.bodyStrong }}>
          {label}
        </BodyText>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget.preferred,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  spinner: { marginRight: spacing.sm },
});
