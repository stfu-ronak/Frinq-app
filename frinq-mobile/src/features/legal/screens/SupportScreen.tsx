import React from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../../../design/components/Screen';
import { BodyText, BrandHeading } from '../../../design/components/Text';
import { ArrowButton } from '../../../design/components/ArrowButton';
import { spacing } from '../../../design/tokens/spacing';

// PLACEHOLDER contact details — mirrors frinq-frontend/app/support/page.tsx;
// replace with the real owner-supplied support email before any real launch.
const SUPPORT_EMAIL = 'support@frinq.in';

/** Static support contact + links out to legal/deletion. Draft placeholder
 *  copy, same "not reviewed by counsel" treatment as the legal documents. */
export function SupportScreen() {
  const navigation = useNavigation<any>();

  return (
    <Screen scroll>
      <BodyText variant="overline" tone="error" style={styles.draftLabel}>
        DRAFT — PLACEHOLDER CONTACT DETAILS
      </BodyText>
      <BrandHeading variant="title" style={styles.title}>
        support
      </BrandHeading>
      <BodyText variant="body" style={styles.paragraph}>
        need help, have a question, or want to report a problem? reach us at:
      </BodyText>
      <ArrowButton
        label={SUPPORT_EMAIL}
        onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
        style={styles.emailLink}
      />

      <View style={styles.linksBlock}>
        <BodyText variant="caption" tone="secondary" style={styles.linkLine}>
          want to delete your account?{' '}
          <BodyText
            variant="caption"
            tone="primary"
            onPress={() => navigation.navigate('Account')}
            accessibilityRole="link"
          >
            account deletion
          </BodyText>
          .
        </BodyText>
        <BodyText variant="caption" tone="secondary" style={styles.linkLine}>
          read our{' '}
          <BodyText
            variant="caption"
            tone="primary"
            onPress={() => navigation.navigate('LegalDocument', { doc: 'terms' })}
            accessibilityRole="link"
          >
            terms
          </BodyText>
          ,{' '}
          <BodyText
            variant="caption"
            tone="primary"
            onPress={() => navigation.navigate('LegalDocument', { doc: 'privacy' })}
            accessibilityRole="link"
          >
            privacy policy
          </BodyText>
          , or{' '}
          <BodyText
            variant="caption"
            tone="primary"
            onPress={() => navigation.navigate('LegalDocument', { doc: 'community-rules' })}
            accessibilityRole="link"
          >
            community rules
          </BodyText>
          .
        </BodyText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  draftLabel: { marginBottom: spacing.md },
  title: { marginBottom: spacing.lg },
  paragraph: { marginBottom: spacing.md },
  emailLink: { alignSelf: 'flex-start', marginBottom: spacing.xl },
  linksBlock: { gap: spacing.sm },
  linkLine: { lineHeight: 20 },
});
