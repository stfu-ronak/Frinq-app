import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
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
 *  color-only).
 *
 *  Hit area and visible pill are deliberately split: the outer Pressable
 *  stays at the 44dp accessibility floor (touchTarget.min) — shrinking that
 *  broke `ChoicePill meets the token minimum height`, an intentional
 *  guardrail — while the inner pill renders 2px shorter on request, centered
 *  within the same tap target. */
export function ChoicePill({ label, selected, onPress, disabled = false, style }: Props) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.hitArea, style]}
    >
      <View
        style={[
          styles.pill,
          { borderColor: disabled ? color.border.subtle : selected ? color.border.default : color.border.pill, backgroundColor: selected ? color.state.selected : 'transparent' },
        ]}
      >
        <BodyText style={{ ...styles.label, color: disabled ? color.text.disabled : selected ? color.text.onMaroon : color.text.pillLabel }}>
          {label}
        </BodyText>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  hitArea: { minHeight: touchTarget.min, justifyContent: 'center', alignItems: 'center' },
  pill: {
    minHeight: touchTarget.min - 2,
    borderWidth: 1,
    borderRadius: radius.pill,
    // Narrower than before (was spacing.lg, then spacing.md): two long
    // options used to be too wide to sit side by side, so the second one
    // dropped to its own row and the grid read as ragged. minHeight stays at
    // (near) the touch-target floor — it is the pill's padding that was
    // trimmed to fit more options per row, never its minimum tap size.
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: { fontFamily: fontFamily.bodyLight, fontSize: 14, lineHeight: 20 },
});
