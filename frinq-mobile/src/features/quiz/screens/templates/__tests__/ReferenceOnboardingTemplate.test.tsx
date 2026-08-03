import React from 'react';
import { StyleSheet } from 'react-native';
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

  it('uses clean Unicode copy for the final ready screen', () => {
    const step = getStep('ready')!;
    const { getByText, getByRole } = render(
      <ReferenceOnboardingTemplate step={step} value={undefined} answers={{}} onAnswer={jest.fn()} onContinue={jest.fn()} onBack={jest.fn()} />,
    );
    expect(getByText("now lets figure out\nyour vibe")).toBeTruthy();
    expect(getByRole('button', { name: 'Hell yeah! 🔥' })).toBeTruthy();
  });

  it('stores an explicit empty answer when pronouns are skipped', () => {
    const step = getStep('pronoun')!;
    const onAnswer = jest.fn();
    const onContinue = jest.fn();
    const { getByRole } = render(
      <ReferenceOnboardingTemplate step={step} value="" answers={{}} onAnswer={onAnswer} onContinue={onContinue} onBack={jest.fn()} />,
    );
    fireEvent.press(getByRole('button', { name: 'Skip pronouns' }));
    expect(onAnswer).toHaveBeenCalledWith('');
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('stores both empty social values when verification is skipped', () => {
    const step = getStep('social_verification')!;
    const onAnswer = jest.fn();
    const onContinue = jest.fn();
    const { getByRole } = render(
      <ReferenceOnboardingTemplate step={step} value={undefined} answers={{}} onAnswer={onAnswer} onContinue={onContinue} onBack={jest.fn()} />,
    );
    fireEvent.press(getByRole('button', { name: 'Skip social verification' }));
    expect(onAnswer).toHaveBeenCalledWith({ linkedin: '', instagram: '' });
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('uses the compact reference scale for the shared choice pages', () => {
    const step = getStep('gender')!;
    if (step.kind !== 'singleChoiceList') throw new Error('gender must use the single-choice reference template');
    const { getByTestId, getByRole } = render(
      <ReferenceOnboardingTemplate step={step} value={undefined} answers={{}} onAnswer={jest.fn()} onContinue={jest.fn()} onBack={jest.fn()} />,
    );
    const heading = StyleSheet.flatten(getByTestId('reference-onboarding-heading').props.style as never) as Record<string, number | string | undefined>;
    const choice = StyleSheet.flatten(getByRole('radio', { name: step.options[0].label }).props.style as never) as Record<string, number | string | undefined>;
    expect(heading).toMatchObject({ color: '#621407', fontSize: 28, lineHeight: 42, maxWidth: 280 });
    expect(choice).toMatchObject({ width: '55%', minHeight: 52, borderRadius: 999 });
  });
});
