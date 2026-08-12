import React, { useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Screen } from '../../../design/components/Screen';
import { BodyText, BrandHeading } from '../../../design/components/Text';
import { ErrorState } from '../../../design/components/ErrorState';
import { ArrowButton } from '../../../design/components/ArrowButton';
import { PressableScale } from '../../../design/motion/PressableScale';
import { radius, spacing, touchTarget } from '../../../design/tokens/spacing';
import { color } from '../../../design/tokens/colors';
import { fontFamily } from '../../../design/tokens/typography';
import { useSession } from '../../../services/session/sessionContext';
import { fetchProfile, maskPhone } from '../profileService';
import { resetForTesting } from '../../settings/resetForTestingService';
import { BootSplash } from '../../../navigation/placeholders';

/** Same ruled-paper ground as the summary page, same 25dp pitch — the two
 *  screens are the only "your own stuff" surfaces in the app and should read
 *  as one place. */
const GRID_GAP = 25;

function RuledGround({ width }: { width: number }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {Array.from({ length: Math.ceil(width / GRID_GAP) }, (_, i) => (
          <Rect key={i} x={i * GRID_GAP} y={0} width={StyleSheet.hairlineWidth} height="100%" fill={color.border.grid} />
        ))}
      </Svg>
    </View>
  );
}

/** Settings, as a labelled pill rather than a bare 22px gear floating in the
 *  corner. The glyph alone was a generic control with no relationship to the
 *  rest of the app's language; pairing it with the word and the same outlined-
 *  pill shape the quiz uses for every other choice makes it belong here. */
function SettingsButton({ onPress }: { onPress: () => void }) {
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel="settings" onPress={onPress} style={styles.settingsPill}>
      <Svg width={16} height={16} viewBox="0 0 22 22" accessibilityElementsHidden importantForAccessibility="no">
        <Circle cx={11} cy={11} r={3.2} stroke={color.brand.maroon} strokeWidth={1.6} fill="none" />
        <Path
          d="M11 1.5V4M11 18V20.5M20.5 11H18M4 11H1.5M17.6 4.4L15.8 6.2M6.2 15.8L4.4 17.6M17.6 17.6L15.8 15.8M6.2 6.2L4.4 4.4"
          stroke={color.brand.maroon}
          strokeWidth={1.6}
          strokeLinecap="round"
        />
      </Svg>
      <BodyText style={styles.settingsLabel}>settings</BodyText>
    </PressableScale>
  );
}

/** One fact. The old version put label and value on the same baseline either
 *  side of a full-width hairline, which reads as a spreadsheet; stacking the
 *  small caps label over the value makes each one a thing you can actually
 *  scan, and the rule only spans the row's own width. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <BodyText style={styles.factLabel}>{label}</BodyText>
      <BodyText style={styles.factValue}>{value}</BodyText>
    </View>
  );
}

/** Read-only profile summary. Only display_name is editable (via EditProfile);
 *  archetype/quiz-derived fields stay read-only here — the Vibe report is the
 *  canonical place they render, not duplicated onto this screen. Never shows
 *  the raw phone number or any internal identifier. */
export function ProfileScreen() {
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();
  const { apiClient, coordinator } = useSession();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['userMe'], queryFn: () => fetchProfile(apiClient) });
  const [resetBusy, setResetBusy] = useState(false);
  const [resetDenied, setResetDenied] = useState(false);

  async function handleReset() {
    if (resetBusy) return;
    setResetBusy(true);
    setResetDenied(false);
    const ok = await resetForTesting(apiClient, coordinator, queryClient);
    // No explicit navigation on success: clearLocalSessionState flips
    // `authenticated` on the coordinator, same as logout — RootNavigator
    // reacts and swaps straight to the entry screen on its own.
    if (!ok) {
      setResetBusy(false);
      setResetDenied(true);
    }
  }

  if (query.isPending) return <BootSplash />;
  if (query.isError) {
    return <ErrorState message="Couldn't load your profile." onRetry={() => query.refetch()} />;
  }

  const user = query.data;
  const squad = user.community_slug ? user.community_slug.replace(/[-_]/g, ' ') : null;

  return (
    <Screen scroll>
      <RuledGround width={width} />

      {/* Masthead, matching the summary's — wordmark left, context right. */}
      <View style={styles.masthead}>
        <BrandHeading variant="display" tone="brand" style={styles.wordmark}>frinq</BrandHeading>
        <SettingsButton onPress={() => navigation.navigate('SettingsHome')} />
      </View>

      {/* Identity, not a form field: the name is the biggest thing on the page
          and the squad sits above it as an eyebrow — which is also why there is
          no "frinq squad" row in the fact sheet below. Saying it twice on one
          screen made it read as two different pieces of information. */}
      {!!squad && <BodyText style={styles.eyebrow}>{squad}</BodyText>}
      <View style={styles.nameRow}>
        <BrandHeading variant="display" tone="brand" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55} style={styles.name}>
          {user.display_name || 'your profile'}
        </BrandHeading>
        <ArrowButton label="edit" onPress={() => navigation.navigate('EditProfile')} />
      </View>

      {/* The report as a destination card, not a text link at the bottom of a
          list — it's the whole reason this screen exists. */}
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="view your full vibe report"
        onPress={() => navigation.navigate('VibeReport')}
        style={styles.reportCard}
      >
        <BodyText style={styles.reportEyebrow}>YOUR READ</BodyText>
        <BrandHeading variant="title" numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.reportTitle}>
          view your full vibe report
        </BrandHeading>
        <BodyText style={styles.reportBody}>the long version — who you are when it counts.</BodyText>
      </PressableScale>

      <View style={styles.factSheet}>
        <Fact label="phone" value={maskPhone(user.phone)} />
        <Fact label="gender" value={user.gender || '—'} />
        <Fact label="age" value={user.age ? String(user.age) : '—'} />
        <Fact label="area" value={user.ncr_zone ? user.ncr_zone.replace(/_/g, ' ') : '—'} />
      </View>

      {/* Test-only affordance, deliberately not gated on __DEV__: this is a
          hand-built review APK, not a store release, and the real gate is
          server-side — POST /users/me/reset-for-testing 404s for any account
          whose phone isn't in the backend's TEST_PHONES list and 404s
          outright in production, so this button is inert for a real user
          even if it stays visible. Quiet styling (plain text, not a filled
          button) so it doesn't compete with "edit" or the report card for
          attention. */}
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="reset test account"
        accessibilityState={{ busy: resetBusy }}
        disabled={resetBusy}
        onPress={handleReset}
        style={styles.resetLink}
      >
        <BodyText style={styles.resetLabel}>
          {resetBusy ? 'resetting…' : 'reset test account'}
        </BodyText>
      </PressableScale>
      {resetDenied && (
        <BodyText style={styles.resetDenied} accessibilityLiveRegion="polite">
          this account can't be reset.
        </BodyText>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  masthead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xxl },
  wordmark: { fontSize: 22, lineHeight: 34 },
  settingsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: touchTarget.min,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.border.pill,
  },
  settingsLabel: { fontFamily: fontFamily.bodyLight, fontSize: 13, color: color.brand.maroon },
  eyebrow: { fontFamily: fontFamily.bodyMedium, fontSize: 12, letterSpacing: 1, color: color.summary.sealRed },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.xxl },
  // Borel needs a line box well above its point size or the ascenders clip.
  name: { flex: 1, fontSize: 34, lineHeight: 50 },
  reportCard: {
    borderRadius: radius.lg,
    backgroundColor: color.summary.cardBg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    marginBottom: spacing.xxl,
  },
  reportEyebrow: { fontFamily: fontFamily.bodyMedium, fontSize: 11, letterSpacing: 1, color: color.summary.cardLabel },
  reportTitle: { marginTop: spacing.sm, fontSize: 24, lineHeight: 32, color: color.brand.cream },
  reportBody: { marginTop: spacing.sm, fontFamily: fontFamily.bodyLight, fontSize: 14, lineHeight: 21, color: color.brand.cream },
  factSheet: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border.subtle,
    paddingHorizontal: spacing.lg,
  },
  fact: { paddingVertical: spacing.md },
  factLabel: { fontFamily: fontFamily.bodyMedium, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: color.text.muted },
  factValue: { marginTop: 2, fontFamily: fontFamily.bodyLight, fontSize: 17, color: color.text.primary },
  resetLink: { alignSelf: 'center', minHeight: touchTarget.min, justifyContent: 'center', marginTop: spacing.xxl },
  resetLabel: { fontFamily: fontFamily.bodyLight, fontSize: 13, color: color.text.muted, textDecorationLine: 'underline' },
  resetDenied: { alignSelf: 'center', marginTop: spacing.xs, fontSize: 12, color: color.text.error },
});
