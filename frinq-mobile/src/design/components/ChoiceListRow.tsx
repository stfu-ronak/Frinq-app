import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
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

/** Full-width single-select row with a trailing check when selected. */
export function ChoiceListRow({ label, selected, onPress, disabled = false, style }: Props) {
  return (
    <PressableScale
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      haptic={!disabled}
      style={[
        styles.base,
        { borderColor: selected ? color.border.default : color.border.subtle, backgroundColor: selected ? color.bg.surface : color.brand.cream },
        style,
      ]}
    >
      <BodyText variant="body" tone={disabled ? 'disabled' : 'primary'} style={styles.label}>
        {label}
      </BodyText>
      {selected && (
        <Svg width={18} height={14} viewBox="0 0 18 14" accessibilityElementsHidden importantForAccessibility="no">
          <Path d="M1 7L6.5 12.5L17 1.5" stroke={color.state.selected} strokeWidth={2} fill="none" />
        </Svg>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget.preferred,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  label: { flex: 1, marginRight: spacing.md },
});
