import React, { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { TextInputTemplate } from '../../quiz/screens/templates/TextInputTemplate';
import { getStep, TextStep } from '../../quiz/domain/quizDefinition';
import { savePendingQuizState } from '../../quiz/pendingQuizState';

const STEP = getStep('name') as TextStep;

/** Pre-auth name collection — the one real answer collected before an
 *  account exists. Held in pendingQuizState (same pattern as
 *  pendingLegalAcceptance) until OTP verify creates the account, at which
 *  point it's flushed into the real per-user encrypted quiz draft. */
export function NameScreen() {
  const navigation = useNavigation<any>();
  const [name, setName] = useState('');

  async function handleContinue() {
    await savePendingQuizState({ name: name.trim() });
    navigation.navigate('Phone');
  }

  return <TextInputTemplate step={STEP} value={name} onChange={setName} onContinue={handleContinue} />;
}
