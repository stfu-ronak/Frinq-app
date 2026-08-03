import React from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Screen } from '../../../design/components/Screen';
import { BodyText, BrandHeading } from '../../../design/components/Text';
import { ArrowButton } from '../../../design/components/ArrowButton';
import { spacing } from '../../../design/tokens/spacing';
import { color } from '../../../design/tokens/colors';
import { useSession } from '../../../services/session/sessionContext';
import { fetchProfile } from '../../profile/profileService';
import { WEB_BASE_URL } from '../../../services/api/config';
import { LegalDocKey } from './LegalDocumentScreen';

const DOCS: ReadonlyArray<{
  key: LegalDocKey;
  label: string;
  path: string;
  acceptedAtField?: 'terms_accepted_at' | 'privacy_accepted_at';
}> = [
  { key: 'terms', label: 'Terms of Service', path: '/terms', acceptedAtField: 'terms_accepted_at' },
  { key: 'privacy', label: 'Privacy Policy', path: '/privacy', acceptedAtField: 'privacy_accepted_at' },
  { key: 'community-rules', label: 'Frinq Squad Rules', path: '/community-rules' },
];

/** Native accessible summaries plus current-acceptance state, with an
 *  explicit opt-in link to the canonical full document online — never an
 *  embedded WebView. Terms/Privacy show when you accepted them (boot
 *  already guarantees it's the current version by the time you can reach
 *  Settings); Community Rules has no separate per-user acceptance to show. */
export function LegalHubScreen() {
  const navigation = useNavigation<any>();
  const { apiClient } = useSession();
  const query = useQuery({ queryKey: ['userMe'], queryFn: () => fetchProfile(apiClient) });

  return (
    <Screen scroll>
      <BrandHeading variant="title" style={styles.title}>
        legal
      </BrandHeading>

      {DOCS.map((doc) => {
        const acceptedAt = doc.acceptedAtField ? query.data?.[doc.acceptedAtField] : null;
        return (
          <View key={doc.key} style={styles.card}>
            <BodyText variant="bodyStrong">{doc.label}</BodyText>
            {!!acceptedAt && (
              <BodyText variant="caption" tone="secondary" style={styles.accepted}>
                accepted {new Date(acceptedAt).toLocaleDateString()}
              </BodyText>
            )}
            <View style={styles.actions}>
              <ArrowButton
                label={`view ${doc.label} in app`}
                onPress={() => navigation.navigate('LegalDocument', { doc: doc.key })}
                style={styles.action}
              />
              <ArrowButton
                label={`read ${doc.label} online`}
                onPress={() => Linking.openURL(`${WEB_BASE_URL}${doc.path}`)}
                style={styles.action}
              />
            </View>
          </View>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.xl },
  card: {
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: color.border.subtle,
  },
  accepted: { marginTop: spacing.xxs },
  // Column, not row: "read {document name} online" runs long enough (e.g.
  // "read Terms of Service online") that two side-by-side actions overflow
  // the screen width — caught only by an on-device visual pass, not a test.
  actions: { marginTop: spacing.md, gap: spacing.sm },
  action: { alignSelf: 'flex-start' },
});
