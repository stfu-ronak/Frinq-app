import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { color } from '../tokens/colors';
import { BodyText } from './Text';

type Props = {
  secondsLeft: number;
  total: number;
  style?: ViewStyle;
};

const SIZE = 120;
const STROKE = 6;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function formatClock(seconds: number): string {
  const s = Math.max(0, seconds);
  const mm = Math.floor(s / 60).toString().padStart(2, '0');
  const ss = Math.floor(s % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}

/** Circular countdown ring, matching the new design's Rapid Fire screen
 *  (a shrinking ring around a centered "Remaining / MM:SS" readout). The
 *  screen owns the interval; this just reflects secondsLeft. The numeric
 *  readout — not the ring's angle alone — carries the actual value for
 *  accessibility/color-independence. */
export function RapidFireTimer({ secondsLeft, total, style }: Props) {
  const pct = total > 0 ? Math.max(0, Math.min(secondsLeft, total)) / total : 0;
  const dashOffset = CIRCUMFERENCE * (1 - pct);

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
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={color.border.subtle}
          strokeWidth={STROKE}
          fill="none"
        />
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={color.state.selected}
          strokeWidth={STROKE}
          fill="none"
          strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          rotation={-90}
          origin={`${SIZE / 2}, ${SIZE / 2}`}
        />
      </Svg>
      <View style={styles.readout} pointerEvents="none">
        <BodyText variant="overline" tone="secondary">remaining</BodyText>
        <BodyText variant="title">{formatClock(secondsLeft)}</BodyText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  readout: { position: 'absolute', alignItems: 'center' },
});
