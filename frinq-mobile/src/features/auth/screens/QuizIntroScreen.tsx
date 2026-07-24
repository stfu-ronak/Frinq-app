import React from 'react';
import { useNavigation } from '@react-navigation/native';
import { IntroTemplate } from '../../quiz/screens/templates/IntroTemplate';
import { getStep } from '../../quiz/domain/quizDefinition';

const STEP = getStep('s0')!;

/** The quiz's own 's0' intro, rendered pre-auth (between Legal and Name) —
 *  reuses the same IntroTemplate/domain copy the authenticated QuizNavigator
 *  uses for every other intro step, so there's exactly one place this
 *  screen's copy lives. */
export function QuizIntroScreen() {
  const navigation = useNavigation<any>();
  if (STEP.kind !== 'intro') return null;
  return <IntroTemplate step={STEP} onContinue={() => navigation.navigate('Name')} />;
}
