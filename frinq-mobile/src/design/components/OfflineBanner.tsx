import React from 'react';
import { StyleSheet, View } from 'react-native';
import { color } from '../tokens/colors';
import { spacing } from '../tokens/spacing';
import { BodyText } from './Text';

type Props = {
  visible: boolean;
  message?: string;
};

/** Global connectivity banner. Announced politely once when it appears; not a
 *  per-message live region. Renders nothing when online. */
export function OfflineBanner({ visible, message = "You're offline — we'll reconnect automatically." }: Props) {
  if (!visible) return null;
  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={styles.base}
    >
      <BodyText variant="caption" tone="onMaroon" style={styles.text}>
        {message}
      </BodyText>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: color.bg.milestone, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, width: '100%' },
  text: { textAlign: 'center' },
});
