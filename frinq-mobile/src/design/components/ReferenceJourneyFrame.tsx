import React from 'react';
import { Image, ScrollView, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { color } from '../tokens/colors';
import { spacing, touchTarget } from '../tokens/spacing';
import { PressableScale } from '../motion/PressableScale';

type Props = {
  children: React.ReactNode;
  tone?: 'cream' | 'maroon';
  onBack?: () => void;
  wave?: boolean;
  scroll?: boolean;
  /** Rendered outside the scrollable area, pinned to the same bottom Y on
   *  every screen that supplies one — independent of how tall the scrollable
   *  content above it is. Without this, a screen with less content than the
   *  viewport bottoms its last child out via flex, while a screen with more
   *  content triggers real scrolling and its last child lands wherever the
   *  content ends instead — the same "Next" arrow drifting to a different
   *  height page to page. Only used by `scroll` screens. */
  footer?: React.ReactNode;
};

/** Shared canvas for the reference-led pre-quiz journey. It supplies layout
 * only; individual screens own their copy, art and live controls. */
export function ReferenceJourneyFrame({ children, tone = 'cream', onBack, wave = false, scroll = false, footer }: Props) {
  const maroon = tone === 'maroon';
  const body = <View style={styles.content}>{children}</View>;

  return (
    <SafeAreaView testID="reference-journey-frame" style={[styles.fill, maroon ? styles.maroon : styles.cream]} edges={['top', 'bottom', 'left', 'right']}>
      <StatusBar barStyle={maroon ? 'light-content' : 'dark-content'} backgroundColor={maroon ? color.bg.milestone : color.bg.canvas} />
      {onBack && (
        <PressableScale accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} haptic={false} style={styles.back}>
          <Image source={require('../../../Public/Assets/Back arrow.png')} style={[styles.backImage, maroon && styles.inverted]} resizeMode="contain" />
        </PressableScale>
      )}
      {wave && <ReferenceWave tone={tone} />}
      {scroll ? (
        <>
          <ScrollView style={styles.scrollFlex} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" showsVerticalScrollIndicator={false}>
            {body}
          </ScrollView>
          {!!footer && <View style={styles.footerWrap}>{footer}</View>}
        </>
      ) : body}
    </SafeAreaView>
  );
}

function ReferenceWave({ tone }: Pick<Props, 'tone'>) {
  const stroke = tone === 'maroon' ? color.brand.cream : color.brand.peach;
  return (
    <View pointerEvents="none" style={styles.wave} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width="100%" height={70} viewBox="0 0 390 70" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Path d="M-15 29C32 70 72 70 126 35C178 1 221 13 274 41C328 70 360 61 410 13" stroke={stroke} strokeWidth={1.4} fill="none" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  cream: { backgroundColor: color.bg.canvas },
  maroon: { backgroundColor: color.bg.milestone },
  content: { flex: 1, width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  scrollFlex: { flex: 1 },
  scrollContent: { flexGrow: 1, alignItems: 'center' },
  footerWrap: { width: '100%', maxWidth: 520, alignSelf: 'center', paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  back: { position: 'absolute', zIndex: 2, top: spacing.xxl, left: spacing.lg, width: touchTarget.preferred, height: touchTarget.preferred, justifyContent: 'center', alignItems: 'center' },
  backImage: { width: 32, height: 24, tintColor: color.brand.maroon },
  inverted: { tintColor: color.brand.cream },
  wave: { position: 'absolute', left: 0, right: 0, top: 60, zIndex: 0 },
});
