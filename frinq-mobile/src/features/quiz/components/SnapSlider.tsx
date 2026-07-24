import React from 'react';
import { View, StyleSheet } from 'react-native';
import { color } from '../../../design/tokens/colors';
import { radius, spacing, touchTarget } from '../../../design/tokens/spacing';
import { BodyText } from '../../../design/components/Text';
import { PressableScale } from '../../../design/motion/PressableScale';

const SNAP_LABELS = ['strongly left', 'left', 'middle', 'right', 'strongly right'];
const SNAP_VALUES = [0, 25, 50, 75, 100] as const;

type Props = {
  prompt: string;
  leftLabel: string;
  leftHint: string;
  rightLabel: string;
  rightHint: string;
  /** One of 0/25/50/75/100, or undefined if unanswered. */
  value: number | undefined;
  onChange: (value: number) => void;
};

/**
 * Discrete 5-stop selector (0/25/50/75/100), tap-based rather than a
 * continuous drag gesture. Data-equivalent to the web reference's snap-to-5
 * slider (every value it can produce is one of these five); a true
 * drag-and-snap gesture is a motion-polish upgrade, not a correctness gap,
 * and can replace this without changing the answer shape.
 */
export function SnapSlider({ prompt, leftLabel, leftHint, rightLabel, rightHint, value, onChange }: Props) {
  const selectedIndex = value === undefined ? -1 : SNAP_VALUES.indexOf(value as (typeof SNAP_VALUES)[number]);

  return (
    <View style={styles.wrap}>
      <BodyText variant="body" style={styles.prompt}>
        {prompt}
      </BodyText>
      <View style={styles.row} accessibilityRole="adjustable" accessibilityLabel={prompt} accessibilityValue={{ min: 0, max: 100, now: value ?? 50 }}>
        {SNAP_VALUES.map((snapValue, i) => (
          <PressableScale
            key={snapValue}
            accessibilityRole="button"
            accessibilityLabel={SNAP_LABELS[i]}
            accessibilityState={{ selected: i === selectedIndex }}
            onPress={() => onChange(snapValue)}
            style={styles.dotTarget}
          >
            <View style={[styles.dot, i === selectedIndex && styles.dotSelected]} />
          </PressableScale>
        ))}
      </View>
      <View style={styles.hintRow}>
        <BodyText variant="overline" tone="secondary">{leftHint.toUpperCase()}</BodyText>
        <BodyText variant="overline" tone="secondary">{rightHint.toUpperCase()}</BodyText>
      </View>
      <View style={styles.hintRow}>
        <BodyText variant="caption" tone="secondary">{leftLabel}</BodyText>
        <BodyText variant="caption" tone="secondary">{rightLabel}</BodyText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.xl },
  prompt: { marginBottom: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dotTarget: { width: touchTarget.min, height: touchTarget.min, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 16, height: 16, borderRadius: radius.pill, borderWidth: 1, borderColor: color.border.default, backgroundColor: 'transparent' },
  dotSelected: { backgroundColor: color.state.selected, borderColor: color.state.selected },
  hintRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
});
