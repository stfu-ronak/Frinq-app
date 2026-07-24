import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { color } from '../tokens/colors';
import { radius, spacing, touchTarget } from '../tokens/spacing';
import { BodyText } from './Text';
import { PressableScale } from '../motion/PressableScale';

type Props = {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
};

/** Outlined capsule choice. Selected = maroon fill; exposes selected/disabled
 *  accessibility state (never color-only). */
export function ChoicePill({ label, selected, onPress, disabled = false, style }: Props) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.base,
        { borderColor: disabled ? color.border.subtle : color.border.default, backgroundColor: selected ? color.state.selected : 'transparent' },
        style,
      ]}
    >
      <BodyText variant="bodyStrong" tone={disabled ? 'disabled' : selected ? 'onMaroon' : 'primary'}>
        {label}
      </BodyText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget.min,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
