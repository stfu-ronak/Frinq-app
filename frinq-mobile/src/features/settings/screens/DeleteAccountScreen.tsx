import React, { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Screen } from '../../../design/components/Screen';
import { BodyText, BrandHeading } from '../../../design/components/Text';
import { OtpField } from '../../../design/components/OtpField';
import { TextField } from '../../../design/components/TextField';
import { PrimaryButton } from '../../../design/components/PrimaryButton';
import { ArrowButton } from '../../../design/components/ArrowButton';
import { spacing } from '../../../design/tokens/spacing';
import { useSession } from '../../../services/session/sessionContext';
import { ApiError } from '../../../services/api/apiError';
import { track } from '../../../services/telemetry/analytics';
import { requestDeletionOtp, verifyDeletionOtp, deleteAccount, mapReverifyError } from '../deleteAccountService';
import { clearLocalSessionState } from '../localSessionCleanup';

type Step = 'confirm' | 'otp_sent' | 'type_delete';
const RESEND_COOLDOWN_SECONDS = 30;
const CONFIRM_WORD = 'DELETE';

/** Irreversible: fresh OTP re-verification, then a typed confirmation,
 *  before the real DELETE /users/me call. Never hidden behind support. */
export function DeleteAccountScreen() {
  const { apiClient, coordinator } = useSession();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>('confirm');
  const [code, setCode] = useState('');
  const [reauthToken, setReauthToken] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  function mapError(err: unknown): string {
    return err instanceof ApiError ? mapReverifyError(err.code) : 'Network error, try again.';
  }

  async function handleRequestOtp() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await requestDeletionOtp(apiClient);
      setStep('otp_sent');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(mapError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyOtp(fullCode: string) {
    if (fullCode.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await verifyDeletionOtp(apiClient, fullCode);
      setReauthToken(result.reauth_token);
      setStep('type_delete');
    } catch (err) {
      setCode('');
      setError(mapError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (confirmText !== CONFIRM_WORD || !reauthToken || busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount(apiClient, reauthToken);
      track('account_deleted');
      await clearLocalSessionState(coordinator, queryClient);
      // No explicit navigation: coordinator.clear() flips `authenticated`,
      // which App.tsx's boot resolver already reacts to, same mechanism as
      // logout — routes to the signed-out root on its own.
    } catch (err) {
      // The reauth token is single-use and was already consumed server-side
      // the instant this call was received, whether or not the deletion
      // itself succeeded — a failure here can never be retried with the same
      // token. Send the user back to request a fresh one rather than
      // offering a retry that's guaranteed to fail with a stale token.
      setReauthToken(null);
      setConfirmText('');
      setStep('confirm');
      setError(
        err instanceof ApiError && err.code === 'reverification required'
          ? 'That code is no longer valid. Request a new one to try again.'
          : "Couldn't delete your account. Request a new code to try again.",
      );
      setBusy(false);
      return;
    }
    setBusy(false);
  }

  if (step === 'confirm') {
    return (
      <Screen scroll>
        <BrandHeading variant="title" style={styles.title}>
          delete account
        </BrandHeading>
        <BodyText variant="body" style={styles.paragraph}>
          This permanently deletes your account and cannot be undone. Your quiz answers, Vibe
          report, and community membership are removed. Messages you sent stay visible to others
          but are no longer linked to you.
        </BodyText>
        <BodyText variant="body" style={styles.paragraph}>
          To continue, we'll send a verification code to your WhatsApp.
        </BodyText>
        {!!error && (
          <BodyText variant="caption" tone="error" accessibilityRole="alert" style={styles.error}>
            {error}
          </BodyText>
        )}
        <PrimaryButton
          label={busy ? 'sending…' : 'send verification code'}
          onPress={handleRequestOtp}
          busy={busy}
          style={styles.action}
        />
      </Screen>
    );
  }

  if (step === 'otp_sent') {
    return (
      <Screen scroll>
        <View style={styles.center}>
          <BrandHeading variant="title" style={styles.title}>
            enter the code
          </BrandHeading>
          <BodyText variant="body" tone="secondary" style={styles.paragraph}>
            We sent a 6-digit code to your WhatsApp.
          </BodyText>
          <OtpField
            value={code}
            onChangeText={(v) => {
              setCode(v);
              if (v.length === 6) handleVerifyOtp(v);
            }}
            error={error}
            autoFocus
          />
          {busy && (
            <BodyText variant="caption" tone="secondary" style={styles.verifying}>
              verifying…
            </BodyText>
          )}
          <ArrowButton
            label={cooldown > 0 ? `resend in ${cooldown}s` : 'resend code'}
            onPress={handleRequestOtp}
            disabled={cooldown > 0 || busy}
            style={styles.action}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <BrandHeading variant="title" style={styles.title}>
        type DELETE to confirm
      </BrandHeading>
      <BodyText variant="body" style={styles.paragraph}>
        This is permanent. Type DELETE below to finish deleting your account.
      </BodyText>
      <TextField
        label="type DELETE"
        value={confirmText}
        onChangeText={setConfirmText}
        autoCapitalize="characters"
        autoCorrect={false}
      />
      {!!error && (
        <BodyText variant="caption" tone="error" accessibilityRole="alert" style={styles.error}>
          {error}
        </BodyText>
      )}
      <PrimaryButton
        label={busy ? 'deleting…' : 'delete my account'}
        onPress={handleDelete}
        disabled={confirmText !== CONFIRM_WORD || busy}
        busy={busy}
        style={styles.action}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
  title: { marginBottom: spacing.lg },
  paragraph: { marginBottom: spacing.md },
  error: { marginBottom: spacing.md },
  action: { marginTop: spacing.xl, alignSelf: 'flex-start' },
  verifying: { marginTop: spacing.md },
});
