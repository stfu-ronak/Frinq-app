import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { color } from '../tokens/colors';
import { radius } from '../tokens/spacing';

type Props = {
  /** 1-based current step. */
  step: number;
  total: number;
  style?: ViewStyle;
};

/** Slim progress bar exposing an accessible progressbar value. Purely
 *  presentational — the fill width is derived, not animated here. */
export function QuizProgress({ step, total, style }: Props) {
  const clamped = Math.max(0, Math.min(step, total));
  const pct = total > 0 ? clamped / total : 0;
  return (
    <View
      style={[styles.track, style]}
      accessible
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: total, now: clamped, text: `Step ${clamped} of ${total}` }}
    >
      <View style={[styles.fill, { width: `${pct * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 4, borderRadius: radius.pill, backgroundColor: color.border.subtle, overflow: 'hidden', width: '100%' },
  fill: { height: '100%', backgroundColor: color.state.selected, borderRadius: radius.pill },
});
