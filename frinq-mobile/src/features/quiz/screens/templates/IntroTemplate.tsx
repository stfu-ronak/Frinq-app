import React from 'react';
import { Screen } from '../../../../design/components/Screen';
import { BrandHeading, BodyText } from '../../../../design/components/Text';
import { PrimaryButton } from '../../../../design/components/PrimaryButton';
import { spacing } from '../../../../design/tokens/spacing';
import { IntroStep } from '../../domain/quizDefinition';

export function IntroTemplate({ step, onContinue }: { step: IntroStep; onContinue: () => void }) {
  return (
    <Screen background="milestone">
      <BrandHeading variant="title" tone="onMaroon">
        {step.heading}
      </BrandHeading>
      {!!step.body && (
        <BodyText variant="body" tone="onMaroon" style={{ marginTop: spacing.md }}>
          {step.body}
        </BodyText>
      )}
      <PrimaryButton label={step.ctaLabel} onPress={onContinue} style={{ marginTop: spacing.xxl, alignSelf: 'flex-start' }} />
    </Screen>
  );
}
