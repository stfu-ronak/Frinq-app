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
 *  small Next-arrow used by the generic question templates.
 *
 *  A step can opt into `theme: 'maroon'` (Figma "ahh.. that was heavy
 *  questioning") for a full-bleed maroon card instead — same idea as
 *  'welcome'/'ready', but built on QuizScreenFrame's own `theme` prop rather
 *  than ReferenceJourneyFrame, so the back arrow and footer land at the
 *  EXACT same position as every other quiz question (ReferenceJourneyFrame
 *  has its own, different chrome positioning — using it here made this one
 *  screen's back arrow/footer sit at different coordinates than the rest of
 *  the quiz). */
export function IntroTemplate({ step, onContinue, onBack }: { step: IntroStep; onContinue: () => void; onBack?: () => void }) {
  const art = ART_BY_STEP_ID[step.id];

  if (step.theme === 'maroon') {
    return (
      <QuizScreenFrame
        stepId={step.id}
        headerVariant="plain"
        theme="maroon"
        onBack={onBack}
        footer={<PrimaryButton label={step.ctaLabel} onPress={onContinue} variant="milestone" style={{ width: '100%' }} />}
      >
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          {/* flex, NOT aspectRatio: the asset is a tall 1608x2788 portrait, so
              pinning its ratio at 86% width forced ~615dp of height and made
              the whole screen scroll. Letting it take the leftover space with
              resizeMode="contain" keeps the flame undistorted AND on one
              screen. On rapid_intro the wording lives inside the artwork, so
              `heading` is empty and no text renders beneath it. */}
          {!!art && (
            <View style={{ flex: 1, width: '86%', marginBottom: step.heading || step.body ? spacing.lg : 0 }}>
              <Image source={art} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
            </View>
          )}
          {!!step.heading && (
            <BrandHeading variant="display" tone="onMaroon" style={{ fontSize: 32, lineHeight: 48, textAlign: 'center' }}>
              {step.heading}
            </BrandHeading>
          )}
          {!!step.body && (
            <BodyText variant="body" tone="onMaroon" style={{ textAlign: 'center', marginTop: spacing.md }}>
              {step.body}
            </BodyText>
          )}
        </View>
      </QuizScreenFrame>
    );
  }

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
  rapid_intro: require('../../../../../Public/Assets/rapid fire hero.png'),
};
