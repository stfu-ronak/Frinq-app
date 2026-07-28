import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Screen } from '../../../design/components/Screen';
import { BrandHeading } from '../../../design/components/Text';
import { ArrowButton } from '../../../design/components/ArrowButton';
import { PressableScale } from '../../../design/motion/PressableScale';
import { BodyText } from '../../../design/components/Text';
import { color } from '../../../design/tokens/colors';
import { spacing, touchTarget } from '../../../design/tokens/spacing';

type Props = {
  stepId: string;
  onBack?: () => void;
  heading: string;
  children?: React.ReactNode;
  continueLabel?: string;
  onContinue?: () => void;
  continueDisabled?: boolean;
  skipLabel?: string;
  onSkip?: () => void;
  style?: ViewStyle;
};

/** Lower-chrome sibling to QuizScreenFrame — no progress bar / section label,
 *  matching the new design's onboarding-style screens (name/phone/otp/
 *  pronoun/city/birthday/social-verification): a lone back arrow, a big
 *  Borel heading, body content, and an ArrowButton continue affordance with
 *  an optional plain-text Skip link underneath. Templates reused across both
 *  an early "simple" step and a later "progress" step pick this vs
 *  QuizScreenFrame based on the step's own `chrome` field. */
export function SimpleStepFrame({
  stepId: _stepId, onBack, heading, children, continueLabel = 'continue',
  onContinue, continueDisabled, skipLabel = 'skip', onSkip, style,
}: Props) {
  return (
    <Screen scroll style={style}>
      {onBack ? (
        <PressableScale accessibilityRole="button" accessibilityLabel="Go back" onPress={onBack} haptic={false} style={styles.back}>
          <Svg width={20} height={16} viewBox="0 0 20 16" accessibilityElementsHidden importantForAccessibility="no">
            <Path d="M8 1.5L1.5 8L8 14.5M2 8H19" stroke={color.text.primary} strokeWidth={1.5} fill="none" />
          </Svg>
        </PressableScale>
      ) : (
        <View style={styles.back} />
      )}
      <BrandHeading variant="display" style={styles.heading}>{heading}</BrandHeading>
      <View style={styles.body}>{children}</View>
      {continueLabel && onContinue && (
        <ArrowButton label={continueLabel} onPress={onContinue} disabled={continueDisabled} style={styles.continue} />
      )}
      {onSkip && (
        <PressableScale accessibilityRole="button" onPress={onSkip} style={styles.skip}>
          <BodyText variant="body" tone="secondary">{skipLabel}</BodyText>
        </PressableScale>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { width: touchTarget.preferred, height: touchTarget.preferred, justifyContent: 'center' },
  heading: { marginTop: spacing.xl, marginBottom: spacing.lg, paddingTop: spacing.xs },
  body: { flex: 1 },
  continue: { marginTop: spacing.xl },
  skip: { minHeight: touchTarget.min, justifyContent: 'center', alignSelf: 'center', marginTop: spacing.sm },
});
