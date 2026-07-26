import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useRoute, RouteProp } from '@react-navigation/native';
import { Screen } from '../../../design/components/Screen';
import { BrandHeading, BodyText } from '../../../design/components/Text';
import { OtpField } from '../../../design/components/OtpField';
import { ArrowButton } from '../../../design/components/ArrowButton';
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
    <Screen scroll>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <BrandHeading variant="title" style={{ marginBottom: spacing.sm }}>
          enter the code
        </BrandHeading>
        <BodyText variant="body" tone="secondary" style={{ marginBottom: spacing.xl }}>
          We sent a 6-digit code to your WhatsApp.
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
          style={{ marginTop: spacing.xl }}
        />
      </View>
    </Screen>
  );
}
