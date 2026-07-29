import React, { useState } from 'react';
import { Image, StyleSheet, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ReferenceJourneyFrame } from '../../../design/components/ReferenceJourneyFrame';
import { BrandHeading, BodyText } from '../../../design/components/Text';
import { PrimaryButton } from '../../../design/components/PrimaryButton';
import { color } from '../../../design/tokens/colors';
import { radius, spacing, touchTarget } from '../../../design/tokens/spacing';
import { useSession } from '../../../services/session/sessionContext';
import { sendOtp } from '../authService';
import { track } from '../../../services/telemetry/analytics';
import { startQuiz } from '../../quiz/quizSyncService';
import { savePendingQuizState } from '../../quiz/pendingQuizState';

/** Reference 2 phone page; submission behavior remains unchanged. */
export function PhoneScreen() {
  const navigation = useNavigation<any>();
  const { apiClient } = useSession();
  const [digits, setDigits] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = digits.length === 10 && !loading;

  async function handleSubmit() {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    const result = await sendOtp(apiClient, digits);
    setLoading(false);
    if (!result.ok) {
      setError(result.code === 'rate_limited' ? 'Too many attempts — wait a bit and try again.' : "Couldn't send the code, try again.");
      return;
    }
    track('otp_requested');
    startQuiz(apiClient, digits).then((res) => savePendingQuizState({ submissionId: res.submission_id })).catch(() => undefined);
    navigation.navigate('Otp', { phone: digits });
  }

  return (
    <ReferenceJourneyFrame onBack={() => navigation.goBack()} scroll>
      <View style={styles.body}>
        <BrandHeading style={styles.heading}>your number</BrandHeading>
        <View style={styles.phoneRow}>
          <BodyText style={styles.country}>+91</BodyText>
          <TextInput accessibilityLabel="Phone number" placeholder="854 5454 6161" placeholderTextColor={color.text.muted} keyboardType="phone-pad" value={digits} onChangeText={(value) => setDigits(value.replace(/\D/g, '').slice(0, 10))} style={styles.input} />
        </View>
        {!!error && <BodyText variant="caption" tone="error" style={styles.error}>{error}</BodyText>}
        <Image source={require('../../../../Public/Assets/telephone 1.png')} style={styles.phoneArt} resizeMode="contain" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
      </View>
      <PrimaryButton label={loading ? 'Sending…' : 'Request OTP'} onPress={handleSubmit} disabled={!canSubmit} busy={loading} style={styles.cta} />
    </ReferenceJourneyFrame>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', paddingTop: 120 },
  heading: { fontSize: 46, lineHeight: 59, textAlign: 'center', marginBottom: spacing.xxxl },
  phoneRow: { width: '100%', flexDirection: 'row', gap: spacing.sm },
  country: { width: 70, minHeight: touchTarget.preferred, borderRadius: radius.sm, backgroundColor: color.bg.surface, textAlign: 'center', textAlignVertical: 'center', paddingTop: 12 },
  input: { flex: 1, minHeight: touchTarget.preferred, borderWidth: 1, borderColor: color.border.subtle, borderRadius: radius.sm, paddingHorizontal: spacing.md, fontFamily: 'VastagoGrotesk-Regular', fontSize: 18, color: color.text.primary },
  error: { alignSelf: 'stretch', marginTop: spacing.sm },
  phoneArt: { width: '100%', height: 250, marginTop: spacing.xxxl, flex: 1 },
  cta: { alignSelf: 'stretch', marginTop: spacing.lg },
});
