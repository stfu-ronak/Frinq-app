import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { color } from '../tokens/colors';

/** The decorative double-hump wave accent under the quiz header, exported so
 *  every quiz screen (Rapid Fire included) renders the same one — matches
 *  the Figma "Line 14" asset exactly (path + gradient), not an approximation. */
export function WaveDivider() {
  return (
    <View pointerEvents="none" style={styles.wrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height={24} viewBox="0 0 411.548 32" preserveAspectRatio="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Defs>
          <LinearGradient id="waveGradient" x1="0" y1="16" x2="411.548" y2="16" gradientUnits="userSpaceOnUse">
            <Stop offset="0.0564" stopColor={color.brand.peach} />
            <Stop offset="0.0962" stopColor={color.brand.cream} />
          </LinearGradient>
        </Defs>
        <Path
          d="M0.250409 0.5C120.798 70.25 125.498 0.5 205.75 0.5C286.003 0.5 319.179 68.7554 411.25 0.5"
          stroke="url(#waveGradient)"
          fill="none"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', height: 24 },
});
