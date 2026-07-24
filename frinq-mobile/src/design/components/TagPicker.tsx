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
            style={styles.pill}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  pill: { marginRight: spacing.sm, marginBottom: spacing.sm },
});
