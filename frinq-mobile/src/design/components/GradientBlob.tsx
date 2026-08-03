import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { color } from '../tokens/colors';

/** The soft peach glow behind the quiz header — matches Figma's "Ellipse 40"
 *  (a plain radial gradient, not an image asset). Clipped to its wrapper so
 *  it reads as a glow peeking from the top-left corner, not a hard circle. */
export function GradientBlob() {
  return (
    <View pointerEvents="none" style={styles.wrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={280} height={280} viewBox="0 0 280 280" style={styles.svg} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Defs>
          <RadialGradient id="blobGradient" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color.brand.peach} stopOpacity={0.65} />
            <Stop offset="1" stopColor={color.brand.peach} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={140} cy={140} rx={140} ry={140} fill="url(#blobGradient)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: -120, left: -80, width: 280, height: 280, zIndex: -1 },
  svg: { position: 'absolute', top: 0, left: 0 },
});
