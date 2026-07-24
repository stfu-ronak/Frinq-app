import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { color } from '../tokens/colors';
import { radius, spacing } from '../tokens/spacing';
import { BodyText } from './Text';

type Props = {
  visible: boolean;
  message: string;
  tone?: 'neutral' | 'error';
  style?: ViewStyle;
};

/** Transient status message, announced politely. The parent owns show/hide
 *  timing; renders nothing when not visible. */
export function Toast({ visible, message, tone = 'neutral', style }: Props) {
  if (!visible) return null;
  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.base, tone === 'error' ? styles.error : styles.neutral, style]}
    >
      <BodyText variant="bodyStrong" tone="onMaroon" style={styles.text}>
        {message}
      </BodyText>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.md, paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  neutral: { backgroundColor: color.bg.milestone },
  error: { backgroundColor: color.state.error },
  text: { textAlign: 'center' },
});
