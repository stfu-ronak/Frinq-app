import React, { useCallback } from 'react';
import { Pressable, PressableProps, ViewStyle, StyleProp } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { motion } from '../tokens/motion';
import { useReducedMotion } from './useReducedMotion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = PressableProps & {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Fire a light selection haptic on press-in (skipped under reduce-motion). */
  haptic?: boolean;
};

/** Press-scale + optional selection haptic. Under reduce-motion the scale is
 *  pinned to 1 and no haptic fires — press still works, just without motion. */
export function PressableScale({ children, style, haptic = true, disabled, onPressIn, onPressOut, ...rest }: Props) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handleIn = useCallback(
    (e: Parameters<NonNullable<PressableProps['onPressIn']>>[0]) => {
      if (!reduced && !disabled) {
        scale.value = withTiming(motion.select.pressScale, { duration: motion.select.duration });
        if (haptic) ReactNativeHapticFeedback.trigger('selection', { enableVibrateFallback: false, ignoreAndroidSystemSettings: false });
      }
      onPressIn?.(e);
    },
    [reduced, disabled, haptic, onPressIn, scale],
  );

  const handleOut = useCallback(
    (e: Parameters<NonNullable<PressableProps['onPressOut']>>[0]) => {
      if (!reduced) scale.value = withTiming(1, { duration: motion.select.duration });
      onPressOut?.(e);
    },
    [reduced, onPressOut, scale],
  );

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={handleIn}
      onPressOut={handleOut}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  );
}
