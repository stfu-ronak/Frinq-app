import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { color } from '../tokens/colors';
import { spacing, touchTarget } from '../tokens/spacing';
import { BodyText } from './Text';
import { PressableScale } from '../motion/PressableScale';
import { WaveDivider } from './WaveDivider';
import { GradientBlob } from './GradientBlob';

type Props = {
  section: string;
  onBack?: () => void;
  style?: ViewStyle;
  /** When set, replaces the uppercase section label with this text verbatim
   *  (e.g. "Question 23 out of 36") — the text+voice screen's counter mode. */
  counterLabel?: string;
};

/** Quiz section header with an optional back affordance, the shared wave
 *  accent, and gradient glow — every quiz screen (Rapid Fire included)
 *  renders through this one component, so all of them stay visually
 *  consistent for free. The section label is a screen-reader header; the
 *  chevron art and wave/glow are decorative. */
export function QuizHeader({ section, onBack, style, counterLabel }: Props) {
  return (
    <View style={styles.wrap}>
      <GradientBlob />
      <View style={[styles.row, style]}>
        {onBack ? (
          <PressableScale accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} haptic={false} style={styles.back}>
            <Svg width={20} height={16} viewBox="0 0 20 16" accessibilityElementsHidden importantForAccessibility="no">
              <Path d="M8 1.5L1.5 8L8 14.5M2 8H19" stroke={color.text.primary} strokeWidth={1.5} fill="none" />
            </Svg>
          </PressableScale>
        ) : (
          <View style={styles.back} />
        )}
        <BodyText variant="overline" tone="secondary" accessibilityRole="header" style={styles.section}>
          {counterLabel ?? section.toUpperCase()}
        </BodyText>
        <View style={styles.back} />
      </View>
      <WaveDivider />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: touchTarget.preferred },
  back: { width: touchTarget.preferred, height: touchTarget.preferred, justifyContent: 'center' },
  section: { flex: 1, textAlign: 'center', letterSpacing: 2, paddingHorizontal: spacing.sm },
});
