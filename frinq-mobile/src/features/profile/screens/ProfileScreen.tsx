import React, { useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Svg, { Path, Rect } from 'react-native-svg';
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

/** Icon-only settings glyph — no pill, no label. A prior version drew the
 *  gear's teeth as thin straight radiating lines, which reads as a sun/
 *  brightness toggle rather than settings; this is an actual gear outline
 *  (a ring with real notched teeth around it) in solid maroon so it's
 *  unambiguous and doesn't wash out against the cream background. */
function SettingsButton({ onPress }: { onPress: () => void }) {
  return (
    <PressableScale accessibilityRole="button" accessibilityLabel="settings" onPress={onPress} style={styles.settingsIcon}>
      <Svg width={24} height={24} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
        <Path
          fill={color.brand.maroon}
          d="M19.14,12.94c0.04,-0.3,0.06,-0.61,0.06,-0.94c0,-0.32,-0.02,-0.64,-0.07,-0.94l2.03,-1.58c0.18,-0.14,0.23,-0.41,0.12,-0.61l-1.92,-3.32c-0.12,-0.22,-0.37,-0.29,-0.59,-0.22l-2.39,0.96c-0.5,-0.38,-1.03,-0.7,-1.62,-0.94L14.4,2.81c-0.04,-0.24,-0.24,-0.41,-0.48,-0.41h-3.84c-0.24,0,-0.43,0.17,-0.47,0.41L9.25,5.35c-0.59,0.24,-1.13,0.57,-1.62,0.94L5.24,5.33c-0.22,-0.08,-0.47,0,-0.59,0.22L2.74,8.87C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.82,11.69,4.82,12s0.02,0.64,0.07,0.94l-2.03,1.58c-0.18,0.14,-0.23,0.41,-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39,-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44,-0.17,0.47,-0.41l0.36,-2.54c0.59,-0.24,1.13,-0.56,1.62,-0.94l2.39,0.96c0.22,0.08,0.47,0,0.59,-0.22l1.92,-3.32c0.12,-0.22,0.07,-0.47,-0.12,-0.61L19.14,12.94z M12,15.6c-1.98,0,-3.6,-1.62,-3.6,-3.6s1.62,-3.6,3.6,-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"
        />
      </Svg>
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
  settingsIcon: {
    width: touchTarget.min,
    height: touchTarget.min,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
