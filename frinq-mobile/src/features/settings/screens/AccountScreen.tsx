import React from 'react';
import { StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../../../design/components/Screen';
import { BodyText, BrandHeading } from '../../../design/components/Text';
import { PrimaryButton } from '../../../design/components/PrimaryButton';
import { spacing } from '../../../design/tokens/spacing';

/** Account-level settings landing. Today this is just the entry point into
 *  account deletion — kept as its own screen (rather than folding straight
 *  into DeleteAccountScreen) so deletion is never one accidental tap from
 *  the main Settings list, and so future account-level settings have a
 *  natural home here. */
export function AccountScreen() {
  const navigation = useNavigation<any>();

  return (
    <Screen>
      <BrandHeading variant="title" style={styles.title}>
        account
      </BrandHeading>
      <BodyText variant="body" tone="secondary" style={styles.paragraph}>
        Deleting your account is permanent and removes your quiz answers, Vibe report, and
        community membership. This can't be undone.
      </BodyText>
      <PrimaryButton
        label="delete my account"
        variant="secondary"
        onPress={() => navigation.navigate('DeleteAccount')}
        style={styles.action}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.lg },
  paragraph: { marginBottom: spacing.xl },
  action: { alignSelf: 'flex-start' },
});
