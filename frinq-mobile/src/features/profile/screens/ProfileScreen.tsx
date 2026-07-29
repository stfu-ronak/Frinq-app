import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import Svg, { Circle, Path } from 'react-native-svg';
import { Screen } from '../../../design/components/Screen';
import { BodyText, BrandHeading } from '../../../design/components/Text';
import { ErrorState } from '../../../design/components/ErrorState';
import { ArrowButton } from '../../../design/components/ArrowButton';
import { PressableScale } from '../../../design/motion/PressableScale';
import { spacing, touchTarget } from '../../../design/tokens/spacing';
import { color } from '../../../design/tokens/colors';
import { useSession } from '../../../services/session/sessionContext';
import { fetchProfile, maskPhone } from '../profileService';
import { BootSplash } from '../../../navigation/placeholders';

/** Settings gear — the only way into Settings now (moved off its own bottom
 *  tab, 2026-07-27 design spec). Decorative glyph, same inline-Svg pattern as
 *  ArrowButton/QuizHeader's back arrow rather than a new icon dependency. */
function SettingsGear({ onPress }: { onPress: () => void }) {
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel="settings" onPress={onPress} style={styles.gear}>
      <Svg width={22} height={22} viewBox="0 0 22 22" accessibilityElementsHidden importantForAccessibility="no">
        <Circle cx={11} cy={11} r={3.2} stroke={color.text.primary} strokeWidth={1.5} fill="none" />
        <Path
          d="M11 1.5V4M11 18V20.5M20.5 11H18M4 11H1.5M17.6 4.4L15.8 6.2M6.2 15.8L4.4 17.6M17.6 17.6L15.8 15.8M6.2 6.2L4.4 4.4"
          stroke={color.text.primary}
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      </Svg>
    </PressableScale>
  );
}

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
      <View style={styles.topRow}>
        <View style={{ flex: 1 }} />
        <SettingsGear onPress={() => navigation.navigate('SettingsHome')} />
      </View>
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
  topRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  gear: { width: touchTarget.preferred, height: touchTarget.preferred, alignItems: 'center', justifyContent: 'center' },
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
