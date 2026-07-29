import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Platform } from 'react-native';
import { Screen } from '../../../design/components/Screen';
import { BrandHeading, BodyText } from '../../../design/components/Text';
import { PrimaryButton } from '../../../design/components/PrimaryButton';
import { spacing, touchTarget } from '../../../design/tokens/spacing';
import { color } from '../../../design/tokens/colors';
import { useSession } from '../../../services/session/sessionContext';
import { fetchCurrentLegal, acceptLegal } from '../../auth/authService';
import { savePendingAcceptance } from '../pendingAcceptance';
import { PressableScale } from '../../../design/motion/PressableScale';

type Mode =
  | { kind: 'preauth'; onContinue: () => void }
  | { kind: 'returning'; onAccepted: () => void };

/** Age + Terms/Privacy consent gate. Two separate unchecked controls (never
 *  pre-checked). Pre-auth: saves a pending acceptance and hands off to Phone.
 *  Returning user (stale server-side acceptance): posts immediately and
 *  re-triggers boot resolution — never lets a stale version continue quietly. */
export function LegalAcceptanceScreen({ mode }: { mode: Mode }) {
  const navigation = useNavigation<any>();
  const { apiClient } = useSession();
  const [termsVersion, setTermsVersion] = useState<string | null>(null);
  const [privacyVersion, setPrivacyVersion] = useState<string | null>(null);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [legalAgreed, setLegalAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCurrentLegal(apiClient)
      .then((legal) => {
        if (cancelled) return;
        setTermsVersion(legal.terms_version);
        setPrivacyVersion(legal.privacy_version);
      })
      .catch(() => {
        // Stay on screen — continue is disabled until versions load.
      });
    return () => {
      cancelled = true;
    };
  }, [apiClient]);

  const canContinue = ageConfirmed && legalAgreed && !!termsVersion && !!privacyVersion && !submitting;

  async function handleContinue() {
    if (!canContinue || !termsVersion || !privacyVersion) return;
    const locale = 'en-IN'; // TODO(Task 41): derive from device locale
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
    <Screen scroll>
      <View style={{ paddingTop: spacing.xxl }}>
        <BodyText variant="overline" tone="secondary">
          before we start
        </BodyText>
        <BrandHeading variant="display" style={{ marginTop: spacing.sm, marginBottom: spacing.xl }}>
          a couple of things first
        </BrandHeading>

        <Checkbox
          checked={ageConfirmed}
          onToggle={() => setAgeConfirmed((v) => !v)}
          label="I confirm I am 18 years of age or older."
        />
        <Checkbox
          checked={legalAgreed}
          onToggle={() => setLegalAgreed((v) => !v)}
          label={
            <BodyText variant="body">
              I agree to the{' '}
              <BodyText
                variant="body"
                tone="error"
                onPress={() => navigation.navigate('LegalDocument', { doc: 'terms' })}
                accessibilityRole="link"
              >
                Terms of Service
              </BodyText>{' '}
              and{' '}
              <BodyText
                variant="body"
                tone="error"
                onPress={() => navigation.navigate('LegalDocument', { doc: 'privacy' })}
                accessibilityRole="link"
              >
                Privacy Policy
              </BodyText>
              .
            </BodyText>
          }
        />

        {!!error && (
          <BodyText variant="caption" tone="error" accessibilityLiveRegion="polite" style={{ marginTop: spacing.md }}>
            {error}
          </BodyText>
        )}

        <PrimaryButton
          label={submitting ? 'Saving…' : 'Continue'}
          onPress={handleContinue}
          disabled={!canContinue}
          busy={submitting}
          style={{ marginTop: spacing.xl, alignSelf: 'flex-start' }}
        />
      </View>
    </Screen>
  );
}

function Checkbox({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label: React.ReactNode }) {
  return (
    <PressableScale
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={onToggle}
      haptic={false}
      style={{ flexDirection: 'row', alignItems: 'flex-start', minHeight: touchTarget.min, marginBottom: spacing.md }}
    >
      <View
        style={{
          width: 24,
          height: 24,
          marginRight: spacing.sm,
          borderWidth: 1,
          borderColor: color.border.default,
          backgroundColor: checked ? color.state.selected : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked && (
          <BodyText variant="bodyStrong" tone="onMaroon">
            ✓
          </BodyText>
        )}
      </View>
      <View style={{ flex: 1 }}>{typeof label === 'string' ? <BodyText variant="body">{label}</BodyText> : label}</View>
    </PressableScale>
  );
}
