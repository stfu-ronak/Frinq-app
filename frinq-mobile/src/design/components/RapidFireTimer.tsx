import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { color } from '../tokens/colors';
import { radius, spacing } from '../tokens/spacing';
import { BodyText } from './Text';

type Props = {
  secondsLeft: number;
  total: number;
  style?: ViewStyle;
};

/** Presentational countdown bar for rapid-fire. The screen owns the interval
 *  (and pauses it in the background); this just reflects secondsLeft. Shows a
 *  numeric readout so timing is not conveyed by the bar (color) alone. */
export function RapidFireTimer({ secondsLeft, total, style }: Props) {
  const pct = total > 0 ? Math.max(0, Math.min(secondsLeft, total)) / total : 0;
  return (
    <View style={[styles.wrap, style]} accessible accessibilityRole="timer" accessibilityLabel={`${secondsLeft} seconds left`}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct * 100}%` }]} />
      </View>
      <BodyText variant="caption" tone="secondary" style={styles.readout}>
        {secondsLeft}s
      </BodyText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center' },
  track: { flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: color.border.subtle, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: color.state.selected, borderRadius: radius.pill },
  readout: { marginLeft: spacing.sm, minWidth: 28, textAlign: 'right' },
});
