import React from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../../../design/components/Screen';
import { BrandHeading, BodyText } from '../../../design/components/Text';
import { ArrowButton } from '../../../design/components/ArrowButton';
import { spacing } from '../../../design/tokens/spacing';
import { loadPendingAcceptance } from '../../legal/pendingAcceptance';
import { loadPendingQuizState } from '../../quiz/pendingQuizState';

/** First-run maroon landing screen. Tap resumes exactly where a prior
 *  (backgrounded, not-yet-verified) attempt left off this session: no
 *  pending acceptance -> Legal; accepted but no name yet -> the quiz's s0
 *  intro; name already saved -> straight to Phone. */
export function LandingScreen() {
  const navigation = useNavigation<any>();

  async function begin() {
    const pending = await loadPendingAcceptance();
    if (!pending) {
      navigation.navigate('Legal');
      return;
    }
    const quizState = await loadPendingQuizState();
    navigation.navigate(quizState?.name ? 'Phone' : 'QuizIntro');
  }

  return (
    <Screen background="milestone">
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <BodyText variant="overline" tone="onMaroon" style={{ marginBottom: spacing.md }}>
          a quiet experiment in friendship
        </BodyText>
        <BrandHeading variant="display" tone="onMaroon">
          find your{'\n'}frinq.
        </BrandHeading>
        <BodyText variant="body" tone="onMaroon" style={{ marginTop: spacing.lg, maxWidth: 280 }}>
          Ten quiet minutes. We read the gaps between your answers and find the people who already
          get you.
        </BodyText>
        <ArrowButton label="begin" onPress={begin} tone="onMaroon" style={{ marginTop: spacing.xxl }} />
      </View>
    </Screen>
  );
}
