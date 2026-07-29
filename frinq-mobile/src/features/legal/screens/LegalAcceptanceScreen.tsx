import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Platform } from 'react-native';
import { ReferenceJourneyFrame } from '../../../design/components/ReferenceJourneyFrame';
import { BrandHeading, BodyText } from '../../../design/components/Text';
import { PrimaryButton } from '../../../design/components/PrimaryButton';
import { spacing } from '../../../design/tokens/spacing';
import { useSession } from '../../../services/session/sessionContext';
import { fetchCurrentLegal, acceptLegal } from '../../auth/authService';
import { savePendingAcceptance } from '../pendingAcceptance';
import { PressableScale } from '../../../design/motion/PressableScale';

type Mode =
  | { kind: 'preauth'; onContinue: () => void }
  | { kind: 'returning'; onAccepted: () => void };

/** Reference 17. The single Accept action is the affirmative consent action;
 * the linked policy text remains available before consent is saved. */
export function LegalAcceptanceScreen({ mode }: { mode: Mode }) {
  const navigation = useNavigation<any>();
  const { apiClient } = useSession();
  const [termsVersion, setTermsVersion] = useState<string | null>(null);
  const [privacyVersion, setPrivacyVersion] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCurrentLegal(apiClient)
      .then((legal) => {
        if (!cancelled) {
          setTermsVersion(legal.terms_version);
          setPrivacyVersion(legal.privacy_version);
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [apiClient]);

  const canAccept = !!termsVersion && !!privacyVersion && !submitting;

  async function handleAccept() {
    if (!canAccept || !termsVersion || !privacyVersion) return;
    const locale = 'en-IN';
    const source = Platform.OS === 'ios' ? 'ios' : 'android';

    if (mode.kind === 'returning') {
      setSubmitting(true);
      setError(null);
      const ok = await acceptLegal(apiClient, { terms_version: termsVersion, privacy_version: privacyVersion, locale, source });
      setSubmitting(false);
      if (!ok) {
        setError("Couldn't save, try again");
        return;
      }
      mode.onAccepted();
      return;
    }

    await savePendingAcceptance({ termsVersion, privacyVersion, locale });
    mode.onContinue();
  }

  return (
    <ReferenceJourneyFrame scroll>
      <View style={styles.body}>
        <Image source={require('../../../../Public/Assets/Privacy.png')} style={styles.icon} resizeMode="contain" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
        <BrandHeading style={styles.heading}>your privacy matters</BrandHeading>
        <BodyText tone="secondary" style={styles.copy}>your data is protected and used only to make Frinq work for you. please review our terms and privacy policy before you continue.</BodyText>
        <BodyText tone="secondary" style={styles.age}>By accepting, you confirm that you are 18 or older.</BodyText>
        <View style={styles.links}>
          <PressableScale accessibilityRole="link" accessibilityLabel="Terms of Service" onPress={() => navigation.navigate('LegalDocument', { doc: 'terms' })} haptic={false}>
            <BodyText tone="secondary">Terms of Service</BodyText>
          </PressableScale>
          <BodyText tone="secondary"> · </BodyText>
          <PressableScale accessibilityRole="link" accessibilityLabel="Privacy Policy" onPress={() => navigation.navigate('LegalDocument', { doc: 'privacy' })} haptic={false}>
            <BodyText tone="secondary">Privacy Policy</BodyText>
          </PressableScale>
        </View>
      </View>
      {!!error && <BodyText variant="caption" tone="error" accessibilityLiveRegion="polite" style={styles.error}>{error}</BodyText>}
      <PrimaryButton label={submitting ? 'Saving…' : 'Accept'} onPress={handleAccept} disabled={!canAccept} busy={submitting} style={styles.cta} />
      <BodyText tone="secondary" style={styles.reject}>change or reject</BodyText>
    </ReferenceJourneyFrame>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: spacing.xxxl },
  icon: { width: 76, height: 76, marginBottom: spacing.xl },
  heading: { textAlign: 'center', fontSize: 42, lineHeight: 55, marginBottom: spacing.lg },
  copy: { maxWidth: 296, textAlign: 'center', fontSize: 17, lineHeight: 26 },
  age: { maxWidth: 296, textAlign: 'center', marginTop: spacing.xl },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: spacing.md },
  error: { marginBottom: spacing.sm, textAlign: 'center' },
  cta: { alignSelf: 'stretch', marginTop: spacing.md },
  reject: { textAlign: 'center', marginTop: spacing.md, marginBottom: spacing.xs },
});
