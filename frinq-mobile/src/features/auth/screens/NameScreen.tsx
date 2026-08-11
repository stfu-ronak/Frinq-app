import React, { useState } from 'react';
import { Image, StyleSheet, TextInput, View } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { ReferenceJourneyFrame } from '../../../design/components/ReferenceJourneyFrame';
import { BodyText, BrandHeading } from '../../../design/components/Text';
import { PressableScale } from '../../../design/motion/PressableScale';
import { useReducedMotion } from '../../../design/motion/useReducedMotion';
import { color } from '../../../design/tokens/colors';
import { spacing, touchTarget } from '../../../design/tokens/spacing';
import { savePendingQuizState } from '../../quiz/pendingQuizState';
import { flushPendingQuizState } from '../../quiz/flushPendingQuizState';
import { useSession } from '../../../services/session/sessionContext';
import type { AuthStackParamList } from '../../../navigation/AuthNavigator';

export const NAME_MIN = 3;
export const NAME_MAX = 16;
const NAME_ERROR = `name should be ${NAME_MIN}-${NAME_MAX} characters`;

/** Reference 7 live name collection. The length rule is deliberately NOT
 *  advertised up front — the field just shakes with the reason if a submit
 *  doesn't satisfy it. The message occupies a permanently-reserved row so
 *  showing it never nudges the input or arrow out of position. */
export function NameScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<AuthStackParamList, 'Name'>>();
  const { apiClient, coordinator } = useSession();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reduced = useReducedMotion();
  const shakeX = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }));

  function rejectWithShake() {
    setError(NAME_ERROR);
    if (reduced) return; // the message alone carries it under reduce-motion
    shakeX.value = withSequence(
      withTiming(-8, { duration: 50 }),
      withTiming(8, { duration: 50 }),
      withTiming(-6, { duration: 50 }),
      withTiming(6, { duration: 50 }),
      withTiming(0, { duration: 50 }),
    );
  }

  /** Terminal step of the pre-auth stack: the OTP already stored the
   *  credential, so once the name is saved this flushes it into the real quiz
   *  draft and THEN flips auth — boot resolution takes over from there and
   *  unmounts this screen. */
  async function handleContinue() {
    if (busy) return;
    const trimmed = name.trim();
    if (trimmed.length < NAME_MIN || trimmed.length > NAME_MAX) {
      rejectWithShake();
      return;
    }
    setError(null);
    setBusy(true);
    await savePendingQuizState({ name: trimmed });
    try {
      await flushPendingQuizState(apiClient, route.params.userId, route.params.phone, route.params.priorSession);
    } catch {
      // Best-effort, same as before: boot resolution is server-authoritative,
      // and a failed flush at worst resumes the quiz without the typed name.
      // Never strand the user on a dead button.
    }
    coordinator.signalAuthenticated();
  }

  return (
    // Back returns to Phone, NOT the spent OTP screen. The credential from
    // this session is already stored, so PhoneScreen short-circuits straight
    // back here if the same number is submitted again — no pointless
    // re-verification of a number we've already proven.
    <ReferenceJourneyFrame onBack={() => navigation.navigate('Phone', { verified: route.params })} scroll>
      <View style={styles.body}>
        <BrandHeading testID="name-heading" tone="brand" style={styles.heading}>what should we{`\n`}call you?</BrandHeading>
        <Animated.View style={[styles.inputWrap, shakeStyle]}>
          <TextInput
            accessibilityLabel="Your name"
            placeholder="your name"
            placeholderTextColor={color.text.muted}
            value={name}
            onChangeText={(v) => { setName(v); if (error) setError(null); }}
            autoCapitalize="words"
            autoFocus
            returnKeyType="next"
            onSubmitEditing={handleContinue}
            style={[styles.input, !!error && styles.inputError]}
          />
        </Animated.View>
        {/* Always rendered — an empty spacer when valid — so surfacing the
            error never shifts the input or the arrow below it. */}
        <View style={styles.errorSlot}>
          {!!error && (
            <BodyText variant="caption" tone="error" accessibilityLiveRegion="polite" style={styles.errorText}>
              {error}
            </BodyText>
          )}
        </View>
        <PressableScale accessibilityRole="button" accessibilityLabel="Continue with name" accessibilityState={{ busy }} disabled={busy} onPress={handleContinue} style={[styles.arrow, busy && styles.arrowBusy]}>
          <Image testID="name-next-arrow" source={require('../../../../Public/Assets/Red arrow.png')} style={styles.arrowImage} resizeMode="contain" />
        </PressableScale>
      </View>
    </ReferenceJourneyFrame>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, alignItems: 'center', paddingTop: 230, paddingBottom: spacing.xl },
  heading: { textAlign: 'center', fontSize: 28, lineHeight: 42, maxWidth: 280 },
  inputWrap: { width: '100%', marginTop: 64 },
  // 17, not 14: at the old size the name the user was typing was hard to read
  // in a full-width centred field. lineHeight tracks it so the box doesn't clip.
  input: { width: '100%', minHeight: touchTarget.preferred, borderBottomWidth: 1, borderBottomColor: color.border.subtle, fontFamily: 'VastagoGrotesk-Regular', fontSize: 17, lineHeight: 25, color: color.text.primary, textAlign: 'center', textAlignVertical: 'center' },
  inputError: { borderBottomColor: color.state.error },
  errorSlot: { height: 24, justifyContent: 'center' },
  errorText: { textAlign: 'center' },
  arrow: { marginTop: 'auto', marginBottom: touchTarget.min + spacing.lg, minHeight: touchTarget.preferred + 8, justifyContent: 'center', alignItems: 'center' },
  arrowImage: { width: 130, height: 48 },
  arrowBusy: { opacity: 0.4 },
});
