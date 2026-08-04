import React from 'react';
import { Image, View } from 'react-native';
import { QuizScreenFrame } from '../../components/QuizScreenFrame';
import { BrandHeading, BodyText } from '../../../../design/components/Text';
import { PrimaryButton } from '../../../../design/components/PrimaryButton';
import { spacing } from '../../../../design/tokens/spacing';
import { IntroStep } from '../../domain/quizDefinition';

/** Milestone/break screens between quiz sections (Figma node 163:2026,
 *  "you're almost there" before Opinions): cream background with the same
 *  back-arrow + wave chrome as every other question, not a full-bleed
 *  maroon card — 'welcome'/'ready' are the exception (handled by
 *  ReferenceOnboardingTemplate's own maroon frame, never this component).
 *  Continue is a full text pill (Figma "Frame 406"), centered, not the
 *  small Next-arrow used by the generic question templates. */
export function IntroTemplate({ step, onContinue, onBack }: { step: IntroStep; onContinue: () => void; onBack?: () => void }) {
  const art = ART_BY_STEP_ID[step.id];
  return (
    <QuizScreenFrame
      stepId={step.id}
      headerVariant="plain"
      onBack={onBack}
      footer={<PrimaryButton label={step.ctaLabel} onPress={onContinue} variant="primary" style={{ width: '76%' }} />}
    >
      <View style={{ flex: 1, alignItems: 'center' }}>
        <BrandHeading variant="display" tone="brand" style={{ fontSize: 32, lineHeight: 40, textAlign: 'center' }}>
          {step.heading}
        </BrandHeading>
        {!!step.body && (
          <BodyText variant="body" tone="secondary" style={{ textAlign: 'center', marginTop: spacing.md }}>
            {step.body}
          </BodyText>
        )}
        {!!art && <Image source={art} style={{ width: 145, height: 122, marginTop: spacing.xxl }} resizeMode="contain" />}
      </View>
    </QuizScreenFrame>
  );
}

const ART_BY_STEP_ID: Record<string, number> = {
  glorious: require('../../../../../Public/Assets/cooking pot 1.png'),
};
