import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { getStep } from '../../../domain/quizDefinition';
import { isReferenceOnboardingStep, ReferenceOnboardingTemplate } from '../ReferenceOnboardingTemplate';

describe('ReferenceOnboardingTemplate', () => {
  it('recognizes only the fixed reference pages', () => {
    expect(isReferenceOnboardingStep('welcome')).toBe(true);
    expect(isReferenceOnboardingStep('social_type')).toBe(false);
  });

  it('personalizes welcome from the saved name', () => {
    const step = getStep('welcome')!;
    const { getByText } = render(
      <ReferenceOnboardingTemplate step={step} value={undefined} answers={{ name: 'Rhea' }} onAnswer={jest.fn()} onContinue={jest.fn()} onBack={jest.fn()} />,
    );
    expect(getByText('Rhea')).toBeTruthy();
  });

  it('lets pronouns be skipped without creating an answer', () => {
    const step = getStep('pronoun')!;
    const onAnswer = jest.fn();
    const onContinue = jest.fn();
    const { getByRole } = render(
      <ReferenceOnboardingTemplate step={step} value="" answers={{}} onAnswer={onAnswer} onContinue={onContinue} onBack={jest.fn()} />,
    );
    fireEvent.press(getByRole('button', { name: 'Skip pronouns' }));
    expect(onAnswer).not.toHaveBeenCalled();
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
