import React from 'react';
import { View } from 'react-native';
import { SimpleStepFrame } from '../../components/SimpleStepFrame';
import { TextField } from '../../../../design/components/TextField';
import { BodyText } from '../../../../design/components/Text';
import { spacing } from '../../../../design/tokens/spacing';
import { SocialVerificationStep } from '../../domain/quizDefinition';

type Props = {
  step: SocialVerificationStep;
  linkedin: string;
  instagram: string;
  onChangeLinkedin: (v: string) => void;
  onChangeInstagram: (v: string) => void;
  onContinue: () => void;
  onSkip: () => void;
  onBack?: () => void;
};

/** Two optional profile links, manually reviewed by admin later — no OAuth.
 *  Both fields may be left blank; Continue and Skip both just advance (Skip
 *  is the more prominent affordance here since the whole step is optional). */
export function SocialVerificationTemplate({
  step, linkedin, instagram, onChangeLinkedin, onChangeInstagram, onContinue, onSkip, onBack,
}: Props) {
  return (
    <SimpleStepFrame
      stepId={step.id}
      onBack={onBack}
      heading={step.heading}
      onContinue={onContinue}
      onSkip={onSkip}
    >
      {!!step.body && (
        <BodyText variant="body" tone="secondary" style={{ marginBottom: spacing.xl }}>
          {step.body}
        </BodyText>
      )}
      <View style={{ gap: spacing.xl }}>
        <TextField
          label="your LinkedIn profile"
          value={linkedin}
          onChangeText={onChangeLinkedin}
          placeholder="linkedin.com/in/..."
          autoCapitalize="none"
          keyboardType="url"
        />
        <TextField
          label="your Instagram profile"
          value={instagram}
          onChangeText={onChangeInstagram}
          placeholder="@yourhandle"
          autoCapitalize="none"
        />
      </View>
    </SimpleStepFrame>
  );
}
