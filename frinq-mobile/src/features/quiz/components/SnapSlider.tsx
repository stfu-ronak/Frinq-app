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
/** "not me" / "that's so me!" is a fixed convention for this component (per
 *  the Figma design), not sourced from leftLabel/rightLabel — those two
 *  props are directional-comparison labels ("what you see" vs "what you
 *  sense") that don't fit a single self-descriptive statement's scale. */
const SCALE_LOW = 'not me';
const SCALE_HIGH = "that's so me!";

export function SnapSlider({ prompt, value, onChange }: Props) {
  const selectedIndex = value === undefined ? -1 : SNAP_VALUES.indexOf(value as (typeof SNAP_VALUES)[number]);

  return (
    <View style={styles.wrap}>
      <BodyText variant="display" tone="brand" style={styles.prompt}>
        {prompt}
      </BodyText>
      <View style={styles.track} accessibilityRole="adjustable" accessibilityLabel={prompt} accessibilityValue={{ min: 0, max: 100, now: value ?? 50 }}>
        {SNAP_VALUES.map((snapValue, i) => {
          const selected = i === selectedIndex;
          return (
            <PressableScale
              key={snapValue}
              accessibilityRole="button"
              accessibilityLabel={SNAP_LABELS[i]}
              accessibilityState={{ selected }}
              onPress={() => onChange(snapValue)}
              style={styles.dotTarget}
            >
              <View style={[styles.dot, selected && styles.dotSelected]} />
            </PressableScale>
          );
        })}
      </View>
      <View style={styles.hintRow}>
        <BodyText variant="caption" tone="secondary">{SCALE_LOW}</BodyText>
        <BodyText variant="caption" tone="secondary">{SCALE_HIGH}</BodyText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.xl },
  prompt: { fontSize: 20, lineHeight: 28, textAlign: 'center', marginBottom: spacing.xl },
  track: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: color.brand.peach, borderRadius: radius.pill,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
  },
  dotTarget: { width: touchTarget.min, height: touchTarget.min, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: color.brand.cream },
  dotSelected: { width: 22, height: 22, backgroundColor: color.state.selected },
  hintRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md },
});
