import React, { useMemo } from 'react';
import { Image, StyleSheet, TextInput, View } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Path, Circle, G, Line } from 'react-native-svg';
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
  const heading = useMemo(() => {
    if (step.id === 'gender') return 'how do you\nidentify yourself';
    if (step.id === 'pronoun') return 'your pronounce';
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
          <DiscoBackground />
          <Image source={require('../../../../../Public/Assets/dudes 3.png')} style={styles.readyArt} resizeMode="contain" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
          <BrandHeading tone="onMaroon" style={styles.readyHeading}>now lets figure out{`\n`}your vibe</BrandHeading>
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
          <BrandHeading testID="reference-onboarding-heading" tone="brand" style={styles.heading}>{heading}</BrandHeading>
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
          <BrandHeading testID="reference-onboarding-heading" tone="brand" style={styles.heading}>{heading}</BrandHeading>
          <TextInput accessibilityLabel="Your pronouns" placeholder="She/her, he/him, they/them" placeholderTextColor={color.text.muted} value={(value as string) ?? ''} onChangeText={onAnswer} style={[styles.underlineInput, { marginTop: 120 }]} />
          <Arrow label="Continue pronouns" onPress={onContinue} />
          <PressableScale accessibilityRole="button" accessibilityLabel="Skip pronouns" onPress={() => { onAnswer(''); onContinue(); }} style={styles.skip}><BodyText tone="secondary">skip</BodyText></PressableScale>
        </View>
      </ReferenceJourneyFrame>
    );
  }

  if (step.id === 'city') {
    const cities = ['Delhi', 'Gurgaon', 'Mumbai', 'Pune', 'Banglore', 'Hyderabad', 'Indore'];
    return (
      <ReferenceJourneyFrame
        onBack={onBack}
        scroll
        footer={(
          <>
            <Arrow label="Continue city" onPress={onContinue} disabled={typeof value !== 'string' || value.trim().length < 2} />
            <PressableScale accessibilityRole="button" accessibilityLabel="Skip city" onPress={() => { onAnswer(''); onContinue(); }} style={styles.skip}><BodyText tone="secondary">skip</BodyText></PressableScale>
          </>
        )}
      >
        <View style={styles.creamBody}>
          <BrandHeading testID="reference-onboarding-heading" tone="brand" style={styles.heading}>{heading}</BrandHeading>
          <TextInput accessibilityLabel="City" placeholder="your city..." placeholderTextColor={color.text.muted} value={(value as string) ?? ''} onChangeText={onAnswer} style={[styles.underlineInput, { marginTop: 80 }]} />
          <View style={styles.cityGrid}>{cities.map((city) => <Choice key={city} compact label={city} selected={value === city} onPress={() => onAnswer(city)} />)}</View>
        </View>
      </ReferenceJourneyFrame>
    );
  }

  if (step.id === 'age') {
    const dateStr = (value as string) || '';
    const parts = dateStr.split('/');
    const day = parts[0] || '';
    const month = parts[1] || '';
    const year = parts[2] || '';
    const updateDate = (d: string, m: string, y: string) => {
      onAnswer(`${d}/${m}/${y}`);
    };
    return (
      <ReferenceJourneyFrame
        onBack={onBack}
        scroll
        footer={<Arrow label="Continue birthday" onPress={onContinue} disabled={!day || !month || !year || year.length < 4} />}
      >
        <View style={styles.creamBody}>
          <BrandHeading testID="reference-onboarding-heading" tone="brand" style={styles.heading}>{heading}</BrandHeading>
          <View style={{ marginTop: 60, alignItems: 'center', gap: 24 }}>
            <View style={{ alignItems: 'center' }}>
              <TextInput accessibilityLabel="Day" placeholder="23" placeholderTextColor={color.text.muted} keyboardType="number-pad" maxLength={2} value={day} onChangeText={(d) => updateDate(d, month, year)} style={styles.birthdayInput} />
              <BodyText tone="secondary" style={styles.birthdayLabel}>day</BodyText>
            </View>
            <View style={{ alignItems: 'center' }}>
              <TextInput accessibilityLabel="Month" placeholder="02" placeholderTextColor={color.text.muted} keyboardType="number-pad" maxLength={2} value={month} onChangeText={(m) => updateDate(day, m, year)} style={styles.birthdayInput} />
              <BodyText tone="secondary" style={styles.birthdayLabel}>month</BodyText>
            </View>
            <View style={{ alignItems: 'center' }}>
              <TextInput accessibilityLabel="Year" placeholder="1999" placeholderTextColor={color.text.muted} keyboardType="number-pad" maxLength={4} value={year} onChangeText={(y) => updateDate(day, month, y)} style={styles.birthdayInput} />
              <BodyText tone="secondary" style={styles.birthdayLabel}>year</BodyText>
            </View>
          </View>
        </View>
      </ReferenceJourneyFrame>
    );
  }

  if (step.id === 'social_verification' && step.kind === 'socialVerification') {
    const linkedin = answerString(answers, step.linkedinAnswerKey);
    const instagram = answerString(answers, step.instagramAnswerKey);
    return (
      <ReferenceJourneyFrame
        onBack={onBack}
        scroll
        footer={(
          <>
            <Arrow label="Continue social verification" onPress={onContinue} />
            <PressableScale accessibilityRole="button" accessibilityLabel="Skip social verification" onPress={() => { onAnswer({ linkedin: '', instagram: '' }); onContinue(); }} style={styles.skip}><BodyText tone="secondary">skip</BodyText></PressableScale>
          </>
        )}
      >
        <View style={styles.creamBody}>
          <BrandHeading testID="reference-onboarding-heading" tone="brand" style={styles.heading}>{heading}</BrandHeading>
          <BodyText tone="secondary" style={styles.socialCopyTop}>we verify every person manually, men and women alike. a profile link is all we need to confirm you're real. we won't show it to matches.</BodyText>
          <TextInput accessibilityLabel="LinkedIn profile" placeholder="your LinkedIn profile" placeholderTextColor={color.text.muted} value={linkedin} onChangeText={(v) => onAnswer({ linkedin: v, instagram })} style={[styles.underlineInput, { marginTop: 40 }]} />
          <TextInput accessibilityLabel="Instagram profile" placeholder="your Instagram profile" placeholderTextColor={color.text.muted} value={instagram} onChangeText={(v) => onAnswer({ linkedin, instagram: v })} style={[styles.underlineInput, { marginTop: 40 }]} />
          <BodyText tone="secondary" style={styles.socialCopyBottom}>Our team reviews this within 24 hours. unverified profiles are shown lower in matches.</BodyText>
        </View>
      </ReferenceJourneyFrame>
    );
  }

  return null;
}

function Choice({ label, selected, onPress, compact = false }: { label: string; selected: boolean; onPress: () => void; compact?: boolean }) {
  return <PressableScale accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress} style={[styles.choice, compact && styles.compactChoice, selected && styles.selectedChoice]}><BodyText style={selected ? { ...styles.choiceLabel, ...styles.selectedChoiceLabel } : styles.choiceLabel}>{label}</BodyText></PressableScale>;
}

function answerString(answers: Record<string, unknown>, key: string): string {
  const value = answers[key];
  return typeof value === 'string' ? value : '';
}

function Arrow({ onPress, disabled = false, label, tone = 'maroon' }: { onPress: () => void; disabled?: boolean; label: string; tone?: 'maroon' | 'cream' }) {
  const source = tone === 'cream' ? require('../../../../../Public/Assets/White arrow.png') : require('../../../../../Public/Assets/Red arrow.png');
  return <PressableScale accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.arrow, disabled && styles.disabled]}><Image source={source} style={styles.arrowImage} resizeMode="contain" /></PressableScale>;
}

const styles = StyleSheet.create({
  maroonBody: { flex: 1, alignItems: 'center', paddingTop: 88, paddingBottom: spacing.xl },
  welcome: { alignSelf: 'flex-start', fontSize: 30, lineHeight: 42 },
  name: { alignSelf: 'flex-start', fontSize: 48, lineHeight: 66 },
  welcomeArt: { width: '100%', height: 330, flex: 1, marginTop: spacing.xl },
  welcomeTag: { fontSize: 36, lineHeight: 52, marginBottom: spacing.xl },
  readyBody: { flex: 1, alignItems: 'center', paddingTop: 52, paddingBottom: spacing.xl },
  readyArt: { width: '100%', height: 390, marginBottom: spacing.lg },
  readyHeading: { fontSize: 40, lineHeight: 56, textAlign: 'center' },
  readyCopy: { fontSize: 22, lineHeight: 30, marginTop: spacing.xl },
  readyCta: { alignSelf: 'stretch', marginTop: 'auto' },
  creamBody: { flex: 1, alignItems: 'center', paddingTop: 130, paddingBottom: spacing.xl },
  heading: { fontSize: 28, lineHeight: 42, textAlign: 'center', maxWidth: 280, paddingHorizontal: 16 },
  options: { width: '100%', marginTop: spacing.xxxl, gap: 24, paddingHorizontal: 40 },
  choice: { width: '55%', minHeight: 52, borderRadius: radius.pill, borderWidth: 1, borderColor: '#7E3024', justifyContent: 'center', alignItems: 'center', paddingHorizontal: spacing.lg },
  compactChoice: { width: 'auto', minHeight: 36, paddingHorizontal: 16, flexGrow: 0, borderColor: color.border.default },
  selectedChoice: { backgroundColor: color.brand.maroon },
  choiceLabel: { textAlign: 'center', fontSize: 16, lineHeight: 24, color: '#7E3024' },
  selectedChoiceLabel: { color: color.brand.cream },
  underlineInput: { width: '100%', minHeight: touchTarget.preferred, marginTop: spacing.xxxl, borderBottomWidth: 1, borderBottomColor: color.border.subtle, textAlign: 'center', fontFamily: 'VastagoGrotesk-Regular', fontSize: 21, lineHeight: 31, color: color.text.primary, paddingBottom: 8 },
  cityGrid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: spacing.xl },
  birthdayInput: { width: 120, minHeight: 40, borderBottomWidth: 1, borderBottomColor: color.border.subtle, textAlign: 'center', fontFamily: 'VastagoGrotesk-Regular', fontSize: 26, lineHeight: 34, color: color.text.primary, paddingBottom: 4 },
  birthdayLabel: { fontSize: 14, marginTop: 4 },
  socialCopyTop: { textAlign: 'center', fontSize: 15, lineHeight: 22, marginTop: spacing.xl, maxWidth: 310 },
  socialCopyBottom: { textAlign: 'center', fontSize: 13, lineHeight: 18, marginTop: 40, maxWidth: 310 },
  arrow: { marginTop: 'auto', minHeight: touchTarget.preferred + 8, justifyContent: 'center', alignItems: 'center' },
  arrowImage: { width: 130, height: 48 },
  disabled: { opacity: 0.4 },
  skip: { minHeight: touchTarget.min, marginTop: 4, justifyContent: 'center' },
});

function DiscoBackground() {
  return (
    <View style={[StyleSheet.absoluteFill, { overflow: 'visible', top: -100 }]} pointerEvents="none">
      <Svg width="100%" height={600} viewBox="0 0 390 600" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Defs>
          <RadialGradient id="grad" cx="195" cy="180" rx="300" ry="300" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#ff00ff" />
            <Stop offset="0.5" stopColor="#ff8c00" />
            <Stop offset="1" stopColor="#621407" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Path d="M0,0 h390 v600 h-390 z" fill="url(#grad)" />
        <G stroke="rgba(255,255,255,0.15)" strokeWidth={30}>
          {[0, 45, 90, 135, 180, 225, 270, 315].map(angle => {
             const rad = angle * Math.PI / 180;
             return <Line key={angle} x1={195} y1={180} x2={195 + Math.cos(rad) * 400} y2={180 + Math.sin(rad) * 400} />;
          })}
        </G>
        <Path d="M195,0 Q205,90 195,120" stroke="#fff" strokeWidth={1} fill="none" />
        <Circle cx="195" cy="180" r="60" stroke="#fff" strokeWidth={1.5} fill="transparent" />
        <Path d="M135,180 A60,20 0 0,0 255,180 A60,20 0 0,0 135,180" stroke="#fff" strokeWidth={1} fill="none" />
        <Path d="M135,180 A60,45 0 0,0 255,180 A60,45 0 0,0 135,180" stroke="#fff" strokeWidth={1} fill="none" />
        <Path d="M195,120 A20,60 0 0,0 195,240 A20,60 0 0,0 195,120" stroke="#fff" strokeWidth={1} fill="none" />
        <Path d="M195,120 A45,60 0 0,0 195,240 A45,60 0 0,0 195,120" stroke="#fff" strokeWidth={1} fill="none" />
        <Path d="M140,140 Q150,150 160,140 Q150,150 150,130 Z" fill="#fff" />
        <Path d="M230,210 Q240,220 250,210 Q240,220 240,200 Z" fill="#fff" />
      </Svg>
    </View>
  );
}
