import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { ClipPath, Defs, Path, Rect } from 'react-native-svg';
import { color } from '../tokens/colors';

type Props = {
  /** 'cream' (default): the usual peach wave, for the cream canvas.
   *  'maroon': plain cream stroke, for a full-bleed maroon screen. */
  tone?: 'cream' | 'maroon';
  /** 0..1 completion. When supplied the wave doubles as the quiz progress
   *  bar: the whole path is drawn in a very light peach, and the leading
   *  `progress` fraction is redrawn in a deeper (but still soft) peach, so
   *  the line visibly fills left-to-right as questions are answered.
   *  Omit it for a purely decorative wave. */
  progress?: number;
};

const VIEW_W = 411.548;
const WAVE_PATH = 'M0.250409 0.5C120.798 70.25 125.498 0.5 205.75 0.5C286.003 0.5 319.179 68.7554 411.25 0.5';

/** The double-hump wave accent under the quiz header — matches the Figma
 *  "Line 14" asset exactly (path), and optionally renders as the quiz's
 *  progress bar via `progress`. */
export function WaveDivider({ tone = 'cream', progress }: Props) {
  const maroon = tone === 'maroon';
  // Maroon (milestone/break) screens sit at a real point in the run too, so
  // they show the same fill — just inverted: a dimmed cream track with a
  // full-strength cream lead, since peach-on-maroon has too little contrast.
  const showProgress = typeof progress === 'number';
  const pct = Math.max(0, Math.min(1, progress ?? 0));
  const track = maroon ? color.border.waveTrackOnMaroon : color.border.waveTrack;
  const fill = maroon ? color.brand.cream : color.brand.peachDeep;

  return (
    <View pointerEvents="none" style={styles.wrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height={24} viewBox={`0 0 ${VIEW_W} 32`} preserveAspectRatio="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {showProgress && (
          <Defs>
            {/* Clips the filled copy to the completed fraction. A rect clip
                (not strokeDasharray) keeps the fill boundary vertical, so it
                reads as a bar filling rather than a line being drawn. */}
            <ClipPath id="waveProgressClip">
              <Rect x={0} y={0} width={VIEW_W * pct} height={32} />
            </ClipPath>
          </Defs>
        )}
        <Path
          d={WAVE_PATH}
          stroke={showProgress ? track : maroon ? color.brand.cream : color.brand.peach}
          strokeWidth={showProgress ? 2 : 1}
          fill="none"
        />
        {showProgress && (
          <Path d={WAVE_PATH} stroke={fill} strokeWidth={2} fill="none" clipPath="url(#waveProgressClip)" />
        )}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', height: 24 },
});
