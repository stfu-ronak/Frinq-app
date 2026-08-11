import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { spacing } from '../tokens/spacing';
import { ChoicePill } from './ChoicePill';

type Props = {
  options: readonly string[];
  /** Currently-selected option values. */
  selected: string[];
  onChange: (next: string[]) => void;
  /** Optional cap; when reached, unselected pills disable. */
  max?: number;
  disabled?: boolean;
  style?: ViewStyle;
};

/** Multi-select wrap of ChoicePills. Toggling respects an optional max. */
export function TagPicker({ options, selected, onChange, max, disabled = false, style }: Props) {
  const atCap = typeof max === 'number' && selected.length >= max;

  const toggle = (opt: string) => {
    if (selected.includes(opt)) onChange(selected.filter((o) => o !== opt));
    else if (!atCap) onChange([...selected, opt]);
  };

  return (
    <View style={[styles.wrap, style]} accessibilityRole="list">
      {options.map((opt) => {
        const isSel = selected.includes(opt);
        return (
          <ChoicePill
            key={opt}
            label={opt}
            selected={isSel}
            disabled={disabled || (!isSel && atCap)}
            onPress={() => toggle(opt)}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // alignItems explicit (not the 'stretch' default), and `gap` instead of
  // per-pill marginRight/marginBottom — a flex-wrap row's first child has
  // been observed on Android mis-painting a multi-word label's second word
  // on the very first layout pass (box/text data both correctly sized once
  // settled, only an early paint pass is wrong) with the default stretch
  // cross-axis and margin-based wrap spacing; flex-start + gap avoid that
  // recalculation path, since Yoga resolves gap-based wrapping in one pass
  // instead of per-child margins that need a last-in-row overflow check.
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: spacing.sm },
});
