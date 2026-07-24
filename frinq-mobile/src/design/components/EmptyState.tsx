import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { spacing } from '../tokens/spacing';
import { BodyText, BrandHeading } from './Text';
import { PrimaryButton } from './PrimaryButton';

type Props = {
  title: string;
  message?: string;
  /** Decorative illustration slot (hidden from accessibility by the caller). */
  illustration?: React.ReactNode;
  action?: { label: string; onPress: () => void };
  style?: ViewStyle;
};

/** Centered empty/placeholder state with an optional action. */
export function EmptyState({ title, message, illustration, action, style }: Props) {
  return (
    <View style={[styles.wrap, style]}>
      {!!illustration && <View style={styles.art} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{illustration}</View>}
      <BrandHeading variant="heading" style={styles.title}>{title}</BrandHeading>
      {!!message && (
        <BodyText variant="body" tone="secondary" style={styles.message}>
          {message}
        </BodyText>
      )}
      {action && <PrimaryButton label={action.label} onPress={action.onPress} style={styles.action} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  art: { marginBottom: spacing.lg },
  title: { textAlign: 'center' },
  message: { textAlign: 'center', marginTop: spacing.sm },
  action: { marginTop: spacing.xl },
});
