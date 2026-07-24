import React, { useEffect } from 'react';
import { StyleSheet, ViewStyle, DimensionValue } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { color } from '../tokens/colors';
import { radius } from '../tokens/spacing';
import { useReducedMotion } from '../motion/useReducedMotion';

type Props = {
  width?: DimensionValue;
  height?: number;
  rounded?: boolean;
  style?: ViewStyle;
};

/** Loading placeholder. Pulses opacity while loading; under reduce-motion it
 *  stays a static block (no looping animation). Hidden from screen readers —
 *  the surrounding region should announce its own busy state. */
export function Skeleton({ width = '100%', height = 16, rounded = false, style }: Props) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(reduced ? 0.5 : 0.35);

  useEffect(() => {
    if (reduced) {
      opacity.value = 0.5;
      return;
    }
    opacity.value = withRepeat(withTiming(0.7, { duration: 700 }), -1, true);
  }, [reduced, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.base,
        { width, height, borderRadius: rounded ? radius.pill : radius.sm },
        animatedStyle,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: color.border.subtle },
});
