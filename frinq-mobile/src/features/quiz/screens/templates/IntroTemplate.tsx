import React from 'react';
import { Image, View, useWindowDimensions } from 'react-native';
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
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  if (step.theme === 'maroon') {
    // rapid_intro's flame art carries its own copy baked in (no separate
    // heading/body render below it), and is meant to read as a full-bleed
    // splash rather than contained artwork — full screen width, top edge
    // flush with the physical top of the screen (status bar included).
    // resizeMode="stretch" against an explicit width AND height (not the
    // source's own aspect ratio) on purpose: the box tracks the actual
    // screen's own aspect ratio — wider screens stretch it wider, taller
    // screens stretch it taller — rather than the art keeping its native
    // 1608:2788 proportions and leaving gaps on a differently-shaped screen.
    const isFullBleedArt = !!art && !step.heading && !step.body;
    // Explicit pixels, not percentages: percentage width/height inside the
    // backdrop's absolutely-positioned (left/right-only, no literal width)
    // container didn't resolve — the image fell back to its raw intrinsic
    // 1608x2788 size and rendered miles off-screen.
    const flameWidth = screenWidth;
    const flameHeight = screenHeight - 30; // bottom pulled up 30px — less vertical stretch on the baked-in "RAPID FIRE" text
    // Glow wash behind the flame, top edge-to-edge — its own natural aspect
    // (804x918), not stretched like the flame above.
    const ellipseHeight = screenWidth * (918 / 804);
    return (
      <QuizScreenFrame
        stepId={step.id}
        headerVariant="plain"
        theme="maroon"
        onBack={onBack}
        backdrop={isFullBleedArt ? (
          <View style={{ width: screenWidth }}>
            <Image source={ELLIPSE_43} style={{ position: 'absolute', top: 0, left: 0, width: screenWidth, height: ellipseHeight }} resizeMode="stretch" />
            <Image source={art} style={{ width: flameWidth, height: flameHeight, marginTop: 20 }} resizeMode="stretch" />
          </View>
        ) : undefined}
        footer={<PrimaryButton label={step.ctaLabel} onPress={onContinue} variant="milestone" style={{ alignSelf: 'stretch', marginHorizontal: 2.5 }} />}
      >
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          {/* flex, NOT aspectRatio: the asset is a tall 1608x2788 portrait, so
              pinning its ratio at 86% width forced ~615dp of height and made
              the whole screen scroll. Letting it take the leftover space with
              resizeMode="contain" keeps the flame undistorted AND on one
              screen. */}
          {!!art && !isFullBleedArt && (
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
  // WebP at the FULL 1608x2788 source resolution, deliberately not downscaled
  // like the gradient washes below: this one is real artwork stretched to
  // fill the whole screen, so it needs its pixels. WebP alone halves it.
  rapid_intro: require('../../../../../Public/Assets/rapid fire hero.webp'),
};

/** Glow wash behind rapid_intro's flame, top edge-to-edge. WebP at half the
 *  source resolution — a smooth gradient with no fine detail, so halving is
 *  visually free even stretched full-width (438KB PNG -> 32KB). Aspect used
 *  at the call site is the 804x918 source's. */
const ELLIPSE_43 = require('../../../../../Public/Assets/Ellipse 43 (1).webp');
