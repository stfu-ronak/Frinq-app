import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { spacing, touchTarget } from '../tokens/spacing';
import { color } from '../tokens/colors';
import { BodyText } from './Text';
import { PressableScale } from '../motion/PressableScale';
import { WaveDivider } from './WaveDivider';

type Props = {
  onBack?: () => void;
  /** "Question N out of Total" — every quiz-proper question (Rapid Fire,
   *  Opinions, Voice/Text, Preferences) shows this; "who you are"-style MCQ
   *  screens (card/list/tags, glow header) show nothing here. */
  counterLabel?: string;
  /** 'cream' (default): maroon back arrow + peach/cream wave, for the usual
   *  cream canvas. 'maroon': cream-tinted back arrow + cream wave, for a
   *  full-bleed maroon milestone screen. */
  tone?: 'cream' | 'maroon';
  /** 0..1 quiz completion — turns the decorative wave into the progress bar
   *  (see WaveDivider). Omitted on milestone/break screens, which sit outside
   *  the question count. */
  progress?: number;
};

/** Fixed (non-scrolling) chrome shared by every quiz question: back arrow,
 *  optional progress counter, and the decorative wave — Figma nodes
 *  163:1663/163:1686 (back arrow position) and "Line 14" (the wave). The
 *  glow (Figma "Ellipse 40") is a separate sibling in QuizScreenFrame, not
 *  rendered here — this wrapper doesn't clip overflow, that one does. */
export function QuizHeader({ onBack, counterLabel, tone = 'cream', progress }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {onBack ? (
          <PressableScale accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} haptic={false} style={styles.back}>
            <Image
              source={require('../../../Public/Assets/Back arrow.png')}
              style={[styles.backImage, tone === 'maroon' && styles.backImageOnMaroon]}
              resizeMode="contain"
            />
          </PressableScale>
        ) : (
          <View style={styles.back} />
        )}
        {!!counterLabel && (
          <BodyText variant="caption" tone={tone === 'maroon' ? 'onMaroon' : 'muted'} accessibilityRole="header" style={styles.counter}>
            {counterLabel}
          </BodyText>
        )}
        <View style={styles.back} />
      </View>
      <WaveDivider tone={tone} progress={progress} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: touchTarget.preferred, paddingHorizontal: spacing.lg },
  back: { width: touchTarget.preferred, height: touchTarget.preferred, justifyContent: 'center', alignItems: 'flex-start' },
  backImage: { width: 28, height: 13 },
  backImageOnMaroon: { tintColor: color.brand.cream },
  counter: { flex: 1, textAlign: 'center', paddingHorizontal: spacing.sm },
});
