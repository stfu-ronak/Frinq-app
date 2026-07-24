import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { spacing } from '../tokens/spacing';
import { BodyText, BrandHeading } from './Text';
import { PrimaryButton } from './PrimaryButton';

type Props = {
  title?: string;
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
  style?: ViewStyle;
};

/** Recoverable error state with a retry affordance. Announced as an alert. */
export function ErrorState({ title = 'Something went wrong', message, onRetry, retrying = false, style }: Props) {
  return (
    <View style={[styles.wrap, style]} accessible accessibilityRole="alert">
      <BrandHeading variant="heading" style={styles.title}>{title}</BrandHeading>
      <BodyText variant="body" tone="secondary" style={styles.message}>
        {message}
      </BodyText>
      {onRetry && <PrimaryButton label={retrying ? 'Retrying…' : 'Try again'} busy={retrying} onPress={onRetry} style={styles.action} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  title: { textAlign: 'center' },
  message: { textAlign: 'center', marginTop: spacing.sm },
  action: { marginTop: spacing.xl },
});
