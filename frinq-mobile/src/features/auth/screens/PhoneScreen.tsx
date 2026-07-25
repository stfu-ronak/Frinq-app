import React, { useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../../../design/components/Screen';
import { BrandHeading, BodyText } from '../../../design/components/Text';
import { PhoneField } from '../../../design/components/PhoneField';
import { PrimaryButton } from '../../../design/components/PrimaryButton';
import { spacing } from '../../../design/tokens/spacing';
import { useSession } from '../../../services/session/sessionContext';
import { sendOtp } from '../authService';
import { track } from '../../../services/telemetry/analytics';
import { startQuiz } from '../../quiz/quizSyncService';
import { savePendingQuizState } from '../../quiz/pendingQuizState';

/** Collects a WhatsApp number and requests an OTP. Digits only, capped at 10
 *  (PhoneField already enforces this); the +91 dial code is a fixed prefix
 *  for this launch, same as the web reference. */
export function PhoneScreen() {
  const navigation = useNavigation<any>();
  const { apiClient } = useSession();
  const [digits, setDigits] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (digits.length < 10 || loading) return;
    setLoading(true);
    setError(null);
    const result = await sendOtp(apiClient, digits);
    setLoading(false);
    if (!result.ok) {
      setError(
        result.code === 'rate_limited'
          ? 'Too many attempts — wait a bit and try again.'
          : "Couldn't send the code, try again.",
      );
      return;
    }
    track('otp_requested');

    // Fire-and-forget, same semantics as the web reference: reuses an
    // existing non-terminal submission for this phone, or creates one.
    // Never blocks navigation to OTP entry on this succeeding.
    startQuiz(apiClient, digits)
      .then((res) => savePendingQuizState({ submissionId: res.submission_id }))
      .catch(() => {
        // Non-fatal: OtpScreen's post-verify flush proceeds without a known
        // submissionId and finalizeQuiz falls back to POST /quiz/submit,
        // which creates one.
      });

    navigation.navigate('Otp', { phone: digits });
  }

  return (
    <Screen scroll>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <BodyText variant="overline" tone="secondary" style={{ marginBottom: spacing.sm }}>
          before we start
        </BodyText>
        <BrandHeading variant="title" style={{ marginBottom: spacing.sm }}>
          what's your WhatsApp number?
        </BrandHeading>
        <BodyText variant="body" tone="secondary" style={{ marginBottom: spacing.xl }}>
          We'll send a 6-digit code to your WhatsApp.
        </BodyText>

        <PhoneField value={digits} onChangeText={setDigits} error={error} autoFocus />

        <PrimaryButton
          label={loading ? 'Sending…' : 'Continue'}
          onPress={handleSubmit}
          disabled={digits.length < 10}
          busy={loading}
          style={{ marginTop: spacing.xl, alignSelf: 'flex-start' }}
        />
      </View>
    </Screen>
  );
}
