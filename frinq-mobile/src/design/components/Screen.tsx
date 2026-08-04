import React from 'react';
import { ScrollView, StatusBar, View, ViewStyle, StyleSheet } from 'react-native';
import { SafeAreaView, Edge } from 'react-native-safe-area-context';
import { color } from '../tokens/colors';
import { spacing } from '../tokens/spacing';

type Background = 'canvas' | 'surface' | 'milestone';

type Props = {
  children: React.ReactNode;
  /** canvas (cream, default), surface (peach), milestone (maroon full-screen). */
  background?: Background;
  /** Scroll long content; short screens stay static. */
  scroll?: boolean;
  /** Cap content width and center it (safe tablet compatibility). */
  maxWidth?: number;
  edges?: readonly Edge[];
  style?: ViewStyle;
};

const BG: Record<Background, string> = {
  canvas: color.bg.canvas,
  surface: color.bg.surface,
  milestone: color.bg.milestone,
};

/** Safe-area-aware screen frame with a centered width cap and a scroll/keyboard
 *  policy. Screens compose this; they don't re-derive background/safe-area. */
export function Screen({ children, background = 'canvas', scroll = false, maxWidth = 520, edges = ['top', 'bottom', 'left', 'right'], style }: Props) {
  const inner = <View style={[styles.inner, { maxWidth }, style]}>{children}</View>;
  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: BG[background] }]} edges={edges}>
      <StatusBar barStyle={background === 'milestone' ? 'light-content' : 'dark-content'} backgroundColor={BG[background]} />
      {scroll ? (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          alwaysBounceVertical={false}
        >
          {inner}
        </ScrollView>
      ) : (
        <View style={styles.staticContent}>{inner}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scrollContent: { flexGrow: 1, alignItems: 'center', padding: spacing.xl },
  staticContent: { flex: 1, alignItems: 'center', padding: spacing.xl },
  inner: { width: '100%', flex: 1 },
});
