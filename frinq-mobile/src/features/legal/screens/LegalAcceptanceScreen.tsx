import React, { useEffect, useState } from 'react';
import { Image, Platform, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { ReferenceJourneyFrame } from '../../../design/components/ReferenceJourneyFrame';
import { BrandHeading, BodyText } from '../../../design/components/Text';
import { ReferenceCtaFooter } from '../../auth/components/ReferenceCtaFooter';
import { spacing } from '../../../design/tokens/spacing';
import { useSession } from '../../../services/session/sessionContext';
import { fetchCurrentLegal, acceptLegal } from '../../auth/authService';
import { savePendingAcceptance } from '../pendingAcceptance';

type Mode =
  | { kind: 'preauth'; onContinue: () => void }
  | { kind: 'returning'; onAccepted: () => void };

/** Reference 17. Pre-auth users may proceed even while the legal endpoint is
 * temporarily unavailable, so onboarding never dead-ends on a transient API failure. */
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

  async function handleAccept() {
    if (submitting) return;
    const locale = 'en-IN';
    const source = Platform.OS === 'ios' ? 'ios' : 'android';
    setSubmitting(true);
    setError(null);
    let currentTermsVersion = termsVersion;
    let currentPrivacyVersion = privacyVersion;

    if ((!currentTermsVersion || !currentPrivacyVersion) && mode.kind === 'returning') {
      try {
        const legal = await fetchCurrentLegal(apiClient);
        currentTermsVersion = legal.terms_version;
        currentPrivacyVersion = legal.privacy_version;
        setTermsVersion(currentTermsVersion);
        setPrivacyVersion(currentPrivacyVersion);
      } catch {
        setSubmitting(false);
        setError("Couldn't load the current terms. Please try Accept again.");
        return;
      }
    }

    if (mode.kind === 'returning') {
      if (!currentTermsVersion || !currentPrivacyVersion) {
        setSubmitting(false);
        setError("Couldn't load the current terms. Please try Accept again.");
        return;
      }
      const ok = await acceptLegal(apiClient, { terms_version: currentTermsVersion, privacy_version: currentPrivacyVersion, locale, source });
      setSubmitting(false);
      if (!ok) {
        setError("Couldn't save, try again");
        return;
      }
      mode.onAccepted();
      return;
    }

    // Pre-auth must never wait for the network. The best available manifest
    // version is cached here; OTP later checks the server's current version
    // before this acceptance is submitted for the newly created account.
    const cachedTermsVersion = currentTermsVersion ?? 'draft-1';
    const cachedPrivacyVersion = currentPrivacyVersion ?? 'draft-1';
    await savePendingAcceptance({ termsVersion: cachedTermsVersion, privacyVersion: cachedPrivacyVersion, locale });
    setSubmitting(false);
    mode.onContinue();
  }

  return (
    <ReferenceJourneyFrame onBack={() => navigation.goBack()}>
      <View style={styles.body}>
        <Image source={require('../../../../Public/Assets/Privacy.png')} style={styles.icon} resizeMode="contain" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
        <BrandHeading tone="brand" style={styles.heading}>your privacy{`\n`}matters</BrandHeading>
        <BodyText tone="muted" variant="intro" style={styles.copy}>We store and process data from your device to provide features in the app and improve your experience</BodyText>
        <BodyText tone="muted" variant="intro" style={styles.details}>You can opt in or out in your privacy setting. find out more in our privacy policy.</BodyText>
        {!!error && <BodyText variant="caption" tone="error" accessibilityLiveRegion="polite" style={styles.error}>{error}</BodyText>}
        <ReferenceCtaFooter
          label="Accept"
          onPress={handleAccept}
          disabled={submitting}
          busy={submitting}
          secondaryLabel="change or reject"
          onSecondaryPress={() => navigation.navigate('LegalDocument', { doc: 'privacy' })}
        />
      </View>
    </ReferenceJourneyFrame>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', paddingTop: 86, paddingBottom: 0 },
  icon: { width: 62, height: 62, marginBottom: spacing.xxl },
  heading: { textAlign: 'center', fontSize: 32, lineHeight: 40, marginBottom: spacing.xs },
  copy: { maxWidth: 310, textAlign: 'center' },
  details: { maxWidth: 310, textAlign: 'center', marginTop: spacing.xl },
  error: { marginBottom: spacing.sm, textAlign: 'center' },
});
