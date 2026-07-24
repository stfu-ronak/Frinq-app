import React, { useEffect } from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { motion } from '../tokens/motion';
import { useReducedMotion } from './useReducedMotion';

type Props = {
  children: React.ReactNode;
  /** Index in a staggered group; multiplies the per-item stagger step. */
  index?: number;
  style?: StyleProp<ViewStyle>;
};

/** Staggered fade + slight translate entrance. Under reduce-motion the content
 *  appears immediately (opacity 1, no translate) — no information is delayed. */
export function FadeInView({ children, index = 0, style }: Props) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(reduced ? 1 : 0);
  const translateY = useSharedValue(reduced ? 0 : motion.enter.translateY);

  useEffect(() => {
    if (reduced) {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }
    const delay = index * motion.enter.staggerStep;
    opacity.value = withDelay(delay, withTiming(1, { duration: motion.enter.duration }));
    translateY.value = withDelay(delay, withTiming(0, { duration: motion.enter.duration }));
  }, [reduced, index, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}
