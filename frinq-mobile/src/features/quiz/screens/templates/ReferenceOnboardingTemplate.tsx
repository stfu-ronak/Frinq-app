import React, { useMemo } from 'react';
import { Image, StyleSheet, TextInput, View } from 'react-native';
import { QuizStep } from '../../domain/quizDefinition';
import { ReferenceJourneyFrame } from '../../../../design/components/ReferenceJourneyFrame';
import { BrandHeading, BodyText } from '../../../../design/components/Text';
import { PrimaryButton } from '../../../../design/components/PrimaryButton';
import { PressableScale } from '../../../../design/motion/PressableScale';
import { color } from '../../../../design/tokens/colors';
import { radius, spacing, touchTarget } from '../../../../design/tokens/spacing';

const REFERENCE_STEP_IDS = new Set(['welcome', 'gender', 'pronoun', 'city', 'age', 'social_verification', 'ready']);

export function isReferenceOnboardingStep(id: string): boolean {
  return REFERENCE_STEP_IDS.has(id);
}

type Props = {
  step: QuizStep;
  value: unknown;
  answers: Record<string, unknown>;
  onAnswer: (value: unknown) => void;
  onContinue: () => void;
  onBack: () => void;
};

/** Live forms for supplied references 6/8/9/10/11/14/15. The component is
 * deliberately restricted to fixed onboarding ids: configured quiz content
 * remains rendered by the generic templates. */
export function ReferenceOnboardingTemplate({ step, value, answers, onAnswer, onContinue, onBack }: Props) {
  const maroon = step.id === 'welcome' || step.id === 'ready';
  const heading = useMemo(() => {
    if (step.id === 'gender') return 'how do you\nidentify yourself';
    if (step.id === 'pronoun') return 'your pronouns';
    if (step.id === 'city') return 'where do you live?';
    if (step.id === 'age') return 'when is your\nbirthday?';
    if (step.id === 'social_verification') return 'social verification';
    return '';
  }, [step.id]);

  if (step.id === 'welcome') {
    const name = typeof answers.name === 'string' && answers.name.trim() ? answers.name.trim() : 'there';
    return (
      <ReferenceJourneyFrame tone="maroon" onBack={onBack}>
        <View style={styles.maroonBody}>
          <BodyText tone="onMaroon" style={styles.welcome}>Welcome,</BodyText>
          <BrandHeading tone="onMaroon" style={styles.name}>{name}</BrandHeading>
          <Image source={require('../../../../../Public/Assets/dudes 2.png')} style={styles.welcomeArt} resizeMode="contain" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
          <BrandHeading tone="onMaroon" style={styles.welcomeTag}>lets find your frinq</BrandHeading>
          <Arrow tone="cream" label="Continue" onPress={onContinue} />
        </View>
      </ReferenceJourneyFrame>
    );
  }

  if (step.id === 'ready') {
    return (
      <ReferenceJourneyFrame tone="maroon" onBack={onBack}>
        <View style={styles.readyBody}>
          <Image source={require('../../../../../Public/Assets/dudes 3.png')} style={styles.readyArt} resizeMode="contain" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
          <BrandHeading tone="onMaroon" style={styles.readyHeading}>now let’s figure out{`\n`}your vibe</BrandHeading>
          <BodyText tone="onMaroon" style={styles.readyCopy}>so. are you ready?</BodyText>
          <PrimaryButton label="Hell yeah! 🔥" variant="secondary" onPress={onContinue} style={styles.readyCta} />
        </View>
      </ReferenceJourneyFrame>
    );
  }

  if (step.id === 'gender' && step.kind === 'singleChoiceList') {
    return (
      <ReferenceJourneyFrame onBack={onBack} scroll>
        <View style={styles.creamBody}>
          <BrandHeading style={styles.heading}>{heading}</BrandHeading>
          <View style={styles.options}>
            {step.options.map((option) => <Choice key={option.value} label={option.label} selected={value === option.value} onPress={() => onAnswer(option.value)} />)}
          </View>
          <Arrow label="Continue identity" onPress={onContinue} disabled={!value} />
        </View>
      </ReferenceJourneyFrame>
    );
  }

  if (step.id === 'pronoun') {
    return (
      <ReferenceJourneyFrame onBack={onBack} scroll>
        <View style={styles.creamBody}>
          <BrandHeading style={styles.heading}>{heading}</BrandHeading>
          <TextInput accessibilityLabel="Your pronouns" placeholder="She/her, he/him, they/them" placeholderTextColor={color.text.muted} value={(value as string) ?? ''} onChangeText={onAnswer} style={styles.underlineInput} />
          <Arrow label="Continue pronouns" onPress={onContinue} />
          <PressableScale accessibilityRole="button" accessibilityLabel="Skip pronouns" onPress={onContinue} style={styles.skip}><BodyText tone="secondary">skip</BodyText></PressableScale>
        </View>
      </ReferenceJourneyFrame>
    );
  }

  if (step.id === 'city') {
    const cities = ['Delhi', 'Gurgaon', 'Mumbai', 'Pune', 'Bangalore', 'Hyderabad', 'Indore'];
    return (
      <ReferenceJourneyFrame onBack={onBack} scroll>
        <View style={styles.creamBody}>
          <BrandHeading style={styles.heading}>{heading}</BrandHeading>
          <TextInput accessibilityLabel="City" placeholder="your city..." placeholderTextColor={color.text.muted} value={(value as string) ?? ''} onChangeText={onAnswer} style={styles.underlineInput} />
          <View style={styles.cityGrid}>{cities.map((city) => <Choice key={city} compact label={city} selected={value === city} onPress={() => onAnswer(city)} />)}</View>
          <Arrow label="Continue city" onPress={onContinue} disabled={typeof value !== 'string' || value.trim().length < 2} />
        </View>
      </ReferenceJourneyFrame>
    );
  }

  if (step.id === 'age') {
    return (
      <ReferenceJourneyFrame onBack={onBack} scroll>
        <View style={styles.creamBody}>
          <BrandHeading style={styles.heading}>{heading}</BrandHeading>
          <TextInput accessibilityLabel="Birthday" placeholder="DD/MM/YYYY" placeholderTextColor={color.text.muted} keyboardType="number-pad" value={(value as string) ?? ''} onChangeText={onAnswer} style={styles.birthdayInput} />
          <Arrow label="Continue birthday" onPress={onContinue} disabled={typeof value !== 'string' || !/^\d{2}\/\d{2}\/\d{4}$/.test(value)} />
        </View>
      </ReferenceJourneyFrame>
    );
  }

  if (step.id === 'social_verification' && step.kind === 'socialVerification') {
    const linkedin = typeof answers[step.linkedinAnswerKey] === 'string' ? answers[step.linkedinAnswerKey] : '';
    const instagram = typeof answers[step.instagramAnswerKey] === 'string' ? answers[step.instagramAnswerKey] : '';
    return (
      <ReferenceJourneyFrame onBack={onBack} scroll>
        <View style={styles.creamBody}>
          <BrandHeading style={styles.heading}>{heading}</BrandHeading>
          <BodyText tone="secondary" style={styles.socialCopy}>we verify every person manually. a profile link helps us confirm you are real. we never show it to matches.</BodyText>
          <TextInput accessibilityLabel="LinkedIn profile" placeholder="your LinkedIn profile" placeholderTextColor={color.text.muted} value={linkedin} onChangeText={(v) => onAnswer({ linkedin: v, instagram })} style={styles.underlineInput} />
          <TextInput accessibilityLabel="Instagram profile" placeholder="your Instagram profile" placeholderTextColor={color.text.muted} value={instagram} onChangeText={(v) => onAnswer({ linkedin, instagram: v })} style={styles.underlineInput} />
          <Arrow label="Continue social verification" onPress={onContinue} />
          <PressableScale accessibilityRole="button" accessibilityLabel="Skip social verification" onPress={onContinue} style={styles.skip}><BodyText tone="secondary">skip</BodyText></PressableScale>
        </View>
      </ReferenceJourneyFrame>
    );
  }

  return null;
}

function Choice({ label, selected, onPress, compact = false }: { label: string; selected: boolean; onPress: () => void; compact?: boolean }) {
  return <PressableScale accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress} style={[styles.choice, compact && styles.compactChoice, selected && styles.selectedChoice]}><BodyText style={[styles.choiceLabel, selected && styles.selectedChoiceLabel]}>{label}</BodyText></PressableScale>;
}

function Arrow({ onPress, disabled = false, label, tone = 'maroon' }: { onPress: () => void; disabled?: boolean; label: string; tone?: 'maroon' | 'cream' }) {
  const source = tone === 'cream' ? require('../../../../../Public/Assets/White arrow.png') : require('../../../../../Public/Assets/Red arrow.png');
  return <PressableScale accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.arrow, disabled && styles.disabled]}><Image source={source} style={styles.arrowImage} resizeMode="contain" /></PressableScale>;
}

const styles = StyleSheet.create({
  maroonBody: { flex: 1, alignItems: 'center', paddingTop: 88, paddingBottom: spacing.xl },
  welcome: { alignSelf: 'flex-start', fontSize: 34, lineHeight: 42 },
  name: { alignSelf: 'flex-start', fontSize: 58, lineHeight: 72 },
  welcomeArt: { width: '100%', height: 330, flex: 1, marginTop: spacing.xl },
  welcomeTag: { fontSize: 40, lineHeight: 54, marginBottom: spacing.xl },
  readyBody: { flex: 1, alignItems: 'center', paddingTop: 52, paddingBottom: spacing.xl },
  readyArt: { width: '100%', height: 390, marginBottom: spacing.lg },
  readyHeading: { fontSize: 48, lineHeight: 62, textAlign: 'center' },
  readyCopy: { fontSize: 22, lineHeight: 30, marginTop: spacing.xl },
  readyCta: { alignSelf: 'stretch', marginTop: 'auto' },
  creamBody: { flex: 1, alignItems: 'center', paddingTop: 130, paddingBottom: spacing.xl },
  heading: { fontSize: 45, lineHeight: 57, textAlign: 'center', maxWidth: 350 },
  options: { width: '100%', marginTop: spacing.xxxl, gap: spacing.lg },
  choice: { width: '100%', minHeight: 74, borderRadius: radius.pill, borderWidth: 1, borderColor: color.border.default, justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.lg },
  compactChoice: { width: 'auto', minHeight: touchTarget.preferred, paddingHorizontal: spacing.lg, flexGrow: 0 },
  selectedChoice: { backgroundColor: color.brand.maroon },
  choiceLabel: { textAlign: 'center', fontSize: 24, lineHeight: 31 },
  selectedChoiceLabel: { color: color.brand.cream },
  underlineInput: { width: '100%', minHeight: touchTarget.preferred, marginTop: spacing.xxxl, borderBottomWidth: 1, borderBottomColor: color.border.subtle, textAlign: 'center', fontFamily: 'VastagoGrotesk-Regular', fontSize: 23, lineHeight: 31, color: color.text.primary },
  cityGrid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.xl },
  birthdayInput: { width: 210, minHeight: touchTarget.preferred, marginTop: spacing.xxxl, borderBottomWidth: 1, borderBottomColor: color.border.subtle, textAlign: 'center', fontFamily: 'VastagoGrotesk-Regular', fontSize: 30, lineHeight: 38, color: color.text.primary },
  socialCopy: { textAlign: 'center', fontSize: 17, lineHeight: 25, marginTop: spacing.xl, maxWidth: 310 },
  arrow: { marginTop: 'auto', minHeight: touchTarget.preferred + 8, justifyContent: 'center', alignItems: 'center' },
  arrowImage: { width: 220, height: 62 },
  disabled: { opacity: 0.4 },
  skip: { minHeight: touchTarget.min, marginTop: spacing.sm, justifyContent: 'center' },
});
