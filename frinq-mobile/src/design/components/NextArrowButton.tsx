import React from 'react';
import { Image, StyleSheet, ViewStyle } from 'react-native';
import { PressableScale } from '../motion/PressableScale';

type Props = {
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  accessibilityLabel?: string;
  style?: ViewStyle;
};

/** Compact "Next" pill used at the bottom of every generic quiz question
 *  (Figma nodes 163:1664/163:1700/etc — 109x48, same ratio as the source
 *  asset). Rapid Fire is the one exception in this app and keeps its own
 *  plain text link instead of this button. The pill outline is baked into
 *  Red arrow.png itself, so no extra border is drawn here. */
export function NextArrowButton({ onPress, disabled = false, busy = false, accessibilityLabel = 'Next', style }: Props) {
  const inactive = disabled || busy;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={[styles.pill, inactive && styles.disabled, style]}
    >
      <Image source={require('../../../Public/Assets/Red arrow.png')} style={styles.image} resizeMode="contain" />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  pill: { width: 109, height: 48, alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  disabled: { opacity: 0.4 },
});
