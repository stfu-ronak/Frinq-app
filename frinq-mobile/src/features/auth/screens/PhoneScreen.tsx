import React, { useState } from 'react';
import { Image, StyleSheet, TextInput, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { AuthStackParamList } from '../../../navigation/AuthNavigator';
import { ReferenceJourneyFrame } from '../../../design/components/ReferenceJourneyFrame';
import { BodyText } from '../../../design/components/Text';
import { ReferenceCtaFooter } from '../components/ReferenceCtaFooter';
import { color } from '../../../design/tokens/colors';
import { radius, spacing } from '../../../design/tokens/spacing';
import { useSession } from '../../../services/session/sessionContext';
import { sendOtp } from '../authService';
import { track } from '../../../services/telemetry/analytics';

/** Reference 2 phone page; submission behavior remains unchanged. */
export function PhoneScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<AuthStackParamList, 'Phone'>>();
  const { apiClient } = useSession();
  const [digits, setDigits] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = digits.length === 10 && !loading;

  async function handleSubmit() {
    if (!canSubmit) return;
    // Backed out of Name after already verifying? The credential for that
    // number is still held, so re-submitting the SAME number skips straight
    // back to Name instead of sending a second code for a number we've
    // already proven. A different number falls through to a normal send.
    const verified = route.params?.verified;
    if (verified && verified.phone === digits) {
      navigation.navigate('Name', verified);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await sendOtp(apiClient, digits);
    setLoading(false);
    if (!result.ok) {
      setError(result.code === 'rate_limited' ? 'Too many attempts — wait a bit and try again.' : "Couldn't send the code, try again.");
      return;
    }
    track('otp_requested');
    navigation.navigate('Otp', { phone: digits });
  }

  return (
    <ReferenceJourneyFrame onBack={() => navigation.goBack()} scroll>
      <View style={styles.body}>
        <Image testID="phone-heading" source={require('../../../../Public/Assets/your number (1).png')} style={styles.heading} resizeMode="contain" accessibilityLabel="your number" />
        <View style={styles.phoneRow}>
          <View testID="phone-country-code" style={styles.country}>
            <BodyText style={styles.countryText}>+91</BodyText>
          </View>
          <TextInput accessibilityLabel="Phone number" placeholder="85454 54616" placeholderTextColor={color.text.muted} keyboardType="phone-pad" value={digits} onChangeText={(value) => setDigits(value.replace(/\D/g, '').slice(0, 10))} style={styles.input} />
        </View>
        {!!error && <BodyText variant="caption" tone="error" style={styles.error}>{error}</BodyText>}
        <Image testID="phone-art" source={require('../../../../Public/Assets/telephone 1.png')} style={styles.phoneArt} resizeMode="contain" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
        <ReferenceCtaFooter label={loading ? 'Sending…' : 'Request OTP'} onPress={handleSubmit} disabled={!canSubmit} busy={loading} />
      </View>
    </ReferenceJourneyFrame>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', paddingTop: 86, paddingBottom: 0 },
  heading: { width: 210, height: 46, marginBottom: spacing.xxxl },
  phoneRow: { width: '100%', flexDirection: 'row', gap: spacing.sm },
  country: { width: 87, height: 49, borderRadius: radius.md, backgroundColor: color.bg.inputMuted, alignItems: 'center', justifyContent: 'center' },
  countryText: { color: color.text.muted, fontSize: 20, lineHeight: 24, textAlign: 'center' },
  input: { flex: 1, height: 49, borderWidth: 1, borderColor: color.bg.inputMuted, borderRadius: radius.md, paddingHorizontal: spacing.md, fontFamily: 'VastagoGrotesk-Regular', fontSize: 20, lineHeight: 24, color: color.text.primary, textAlignVertical: 'center' },
  error: { alignSelf: 'stretch', marginTop: spacing.sm },
  phoneArt: { width: '100%', height: 192, marginTop: 140, flex: 0 },
});
