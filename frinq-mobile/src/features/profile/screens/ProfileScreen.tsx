import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { Screen } from '../../../design/components/Screen';
import { BodyText, BrandHeading } from '../../../design/components/Text';
import { ErrorState } from '../../../design/components/ErrorState';
import { ArrowButton } from '../../../design/components/ArrowButton';
import { spacing } from '../../../design/tokens/spacing';
import { color } from '../../../design/tokens/colors';
import { useSession } from '../../../services/session/sessionContext';
import { fetchProfile, maskPhone } from '../profileService';
import { BootSplash } from '../../../navigation/placeholders';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <BodyText variant="overline" tone="secondary">
        {label}
      </BodyText>
      <BodyText variant="body">{value}</BodyText>
    </View>
  );
}

/** Read-only profile summary. Only display_name is editable (via EditProfile);
 *  archetype/quiz-derived fields stay read-only here — the Vibe report is the
 *  canonical place they render, not duplicated onto this screen. Never shows
 *  the raw phone number or any internal identifier. */
export function ProfileScreen() {
  const navigation = useNavigation<any>();
  const { apiClient } = useSession();
  const query = useQuery({ queryKey: ['userMe'], queryFn: () => fetchProfile(apiClient) });

  if (query.isPending) return <BootSplash />;
  if (query.isError) {
    return <ErrorState message="Couldn't load your profile." onRetry={() => query.refetch()} />;
  }

  const user = query.data;

  return (
    <Screen scroll>
      <View style={styles.header}>
        <BrandHeading variant="title" style={styles.name}>
          {user.display_name || 'your profile'}
        </BrandHeading>
        <ArrowButton label="edit" onPress={() => navigation.navigate('EditProfile')} />
      </View>

      <Row label="phone" value={maskPhone(user.phone)} />
      <Row label="gender" value={user.gender || '—'} />
      <Row label="age" value={user.age ? String(user.age) : '—'} />
      <Row label="area" value={user.ncr_zone ? user.ncr_zone.replace(/_/g, ' ') : '—'} />
      <Row label="community" value={user.community_slug ? user.community_slug.replace(/-/g, ' ') : '—'} />

      <ArrowButton
        label="view your full vibe report"
        tone="primary"
        onPress={() => navigation.navigate('VibeReport')}
        style={styles.vibeLink}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: spacing.xl },
  name: { flex: 1, marginRight: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.border.subtle,
  },
  vibeLink: { marginTop: spacing.xl },
});
