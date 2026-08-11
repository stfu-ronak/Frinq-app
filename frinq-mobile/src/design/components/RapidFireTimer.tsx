import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { color } from '../tokens/colors';
import { BodyText } from './Text';

type Props = {
  secondsLeft: number;
  total: number;
  style?: ViewStyle;
};

const SIZE = 160;
const CENTER = SIZE / 2;
const OUTER_RADIUS = SIZE / 2 - 4;
const INNER_RADIUS = OUTER_RADIUS - 16;
const TICK_COUNT = 24;

function formatClock(seconds: number): string {
  const s = Math.max(0, seconds);
  const mm = Math.floor(s / 60).toString().padStart(2, '0');
  const ss = Math.floor(s % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

/** Sunburst countdown dial, matching the new design's Rapid Fire screen: a
 *  ring of radiating ticks (not a filled arc) sweeps from maroon to gray as
 *  time elapses, around a centered "Remaining / MM:SS" readout. The screen
 *  owns the interval; this just reflects secondsLeft. The numeric readout —
 *  not the tick count alone — carries the actual value for accessibility/
 *  color-independence. */
export function RapidFireTimer({ secondsLeft, total, style }: Props) {
  const elapsedFraction = total > 0 ? 1 - Math.max(0, Math.min(secondsLeft, total)) / total : 0;
  const elapsedTicks = Math.round(elapsedFraction * TICK_COUNT);

  return (
    <View
      style={[styles.wrap, style]}
      accessible
      accessibilityRole="timer"
      accessibilityLabel={`${secondsLeft} seconds left`}
    >
      <Svg
        width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}
        accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      >
        {Array.from({ length: TICK_COUNT }, (_, i) => {
          const angle = (i / TICK_COUNT) * 2 * Math.PI - Math.PI / 2;
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          return (
            <Line
              key={i}
              x1={CENTER + INNER_RADIUS * cos}
              y1={CENTER + INNER_RADIUS * sin}
              x2={CENTER + OUTER_RADIUS * cos}
              y2={CENTER + OUTER_RADIUS * sin}
              stroke={i < elapsedTicks ? color.brand.maroon : color.border.subtle}
              strokeWidth={2}
              strokeLinecap="round"
            />
          );
        })}
      </Svg>
      <View style={styles.readout} pointerEvents="none">
        <BodyText variant="overline" tone="secondary">Remaining</BodyText>
        <BodyText variant="title" style={styles.time}>{formatClock(secondsLeft)}</BodyText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  readout: { position: 'absolute', alignItems: 'center' },
  time: { fontSize: 40, lineHeight: 48 },
});
