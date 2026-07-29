import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { ReferenceJourneyFrame } from '../../../design/components/ReferenceJourneyFrame';
import { BrandHeading, BodyText } from '../../../design/components/Text';
import { OtpField } from '../../../design/components/OtpField';
import { ArrowButton } from '../../../design/components/ArrowButton';
import { PrimaryButton } from '../../../design/components/PrimaryButton';
import { spacing } from '../../../design/tokens/spacing';
import { useSession } from '../../../services/session/sessionContext';
import { sendOtp, verifyOtp, acceptLegal } from '../authService';
import { loadPendingAcceptance, clearPendingAcceptance } from '../../legal/pendingAcceptance';
import { flushPendingQuizState } from '../../quiz/flushPendingQuizState';
import { track } from '../../../services/telemetry/analytics';

const RESEND_COOLDOWN_SECONDS = 30;

const ERROR_COPY: Record<string, string> = {
  invalid: 'Wrong code — check your WhatsApp and retype.',
  expired: "That code is no longer valid — tap 'resend code' below.",
  timeout: 'Verification is taking too long. Try again.',
  network_error: 'Network error, check your connection.',
};

export type OtpRouteParams = { Otp: { phone: string } };

/** Verifies the OTP, persists the rotating session, flushes any pending legal
 *  acceptance, then lets boot-state resolution (server-authoritative) route
 *  onward — this screen never decides the destination itself. */
export function OtpScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<OtpRouteParams, 'Otp'>>();
  const { phone } = route.params;
  const { apiClient, coordinator } = useSession();

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function handleVerify(fullCode: string) {
    if (fullCode.length !== 6 || loading) return;
    setLoading(true);
    setError(null);

    const result = await verifyOtp(apiClient, phone, fullCode);
    if (!result.ok || !result.data) {
      setLoading(false);
      setCode('');
      setError(ERROR_COPY[result.code ?? 'network_error'] ?? "Couldn't verify, try again.");
      return;
    }

    track('otp_verified');
    // Set the credential but DON'T flip auth yet — we must finish writing the
    // pre-auth pending state (legal acceptance + quiz draft) before boot
    // re-resolution mounts the quiz navigator and reads that draft. Flipping
    // now would race the flush and could resume the quiz from the wrong step.
    let tokensSet = false;
    try {
      await coordinator.setTokens(
        { access_token: result.data.access_token, refresh_token: result.data.refresh_token },
        { signalAuthChange: false },
      );
      tokensSet = true;

      const pending = await loadPendingAcceptance();
      if (pending) {
        const accepted = await acceptLegal(apiClient, {
          terms_version: pending.termsVersion,
          privacy_version: pending.privacyVersion,
          locale: pending.locale,
          source: 'android',
        });
        if (accepted) await clearPendingAcceptance();
        // If it failed, boot resolution will see the account's stale legal
        // version server-side and route back to Legal — never silently proceed.
      }

      await flushPendingQuizState(apiClient, result.data.user.id, phone, result.data.prior_session);
    } catch {
      // The pending-state flush is best-effort. If connectivity drops after
      // the tokens are set, we must NOT strand the user on the "verifying…"
      // spinner (and must not leak an unhandled rejection — handleVerify is
      // called un-awaited). Boot resolution is server-authoritative; a failed
      // quiz-draft flush at worst resumes the quiz without the typed name.
    }

    setLoading(false);
    if (tokensSet) {
      // Flip auth so boot resolution takes over routing (server-authoritative).
      coordinator.signalAuthenticated();
    } else {
      // Couldn't even persist the credential — surface a retry rather than
      // silently proceeding unauthenticated.
      setCode('');
      setError(ERROR_COPY.network_error ?? "Couldn't verify, try again.");
    }
  }

  async function handleResend() {
    if (cooldown > 0) return;
    setCooldown(RESEND_COOLDOWN_SECONDS);
    await sendOtp(apiClient, phone);
  }

  return (
    <ReferenceJourneyFrame onBack={() => navigation.goBack()} scroll>
      <View style={styles.body}>
        <BrandHeading style={styles.heading}>verify</BrandHeading>
        <BodyText tone="secondary" style={styles.copy}>
          OTP has been sent to 91+ {phone}
        </BodyText>

        <OtpField value={code} onChangeText={(v) => { setCode(v); if (v.length === 6) handleVerify(v); }} error={error} autoFocus />

        {loading && (
          <BodyText variant="caption" tone="secondary" style={{ marginTop: spacing.md }}>
            verifying…
          </BodyText>
        )}

        <ArrowButton
          label={cooldown > 0 ? `resend in ${cooldown}s` : 'resend code'}
          onPress={handleResend}
          disabled={cooldown > 0}
          style={styles.resend}
        />
      </View>
      <PrimaryButton label="Confirm" onPress={() => handleVerify(code)} disabled={code.length !== 6} busy={loading} style={styles.confirm} />
    </ReferenceJourneyFrame>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', paddingTop: 132 },
  heading: { fontSize: 52, lineHeight: 64, textAlign: 'center', marginBottom: spacing.md },
  copy: { textAlign: 'center', fontSize: 17, lineHeight: 26, marginBottom: spacing.xxl },
  resend: { alignSelf: 'center', marginTop: spacing.xl },
  confirm: { alignSelf: 'stretch', marginTop: spacing.lg },
});
