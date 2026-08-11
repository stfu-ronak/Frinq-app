import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import { color } from '../tokens/colors';
import { radius, spacing, touchTarget } from '../tokens/spacing';
import { fontFamily } from '../tokens/typography';
import { BodyText } from './Text';
import { PressableScale } from '../motion/PressableScale';

type Props = {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
};

/** Outlined capsule choice — same rest/selected treatment as MCQ type1's
 *  plain pill (SingleChoiceListTemplate's PlainPillOption): a faded border
 *  and faded light-weight label at rest, filled maroon + cream label only
 *  once selected. Exposes selected/disabled accessibility state (never
 *  color-only). */
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
        { borderColor: disabled ? color.border.subtle : selected ? color.border.default : color.border.pill, backgroundColor: selected ? color.state.selected : 'transparent' },
        style,
      ]}
    >
      <BodyText style={{ ...styles.label, color: disabled ? color.text.disabled : selected ? color.text.onMaroon : color.text.pillLabel }}>
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
    // Narrower than before (was spacing.lg): two long options used to be too
    // wide to sit side by side, so the second one dropped to its own row and
    // the grid read as ragged. minHeight stays at the touch-target floor — it
    // is the pill's WIDTH that was the problem, not its height.
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: { fontFamily: fontFamily.bodyLight, fontSize: 14, lineHeight: 20 },
});
