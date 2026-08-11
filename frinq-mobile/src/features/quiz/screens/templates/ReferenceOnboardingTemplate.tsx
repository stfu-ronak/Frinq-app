import React, { useMemo } from 'react';
import { Image, StyleSheet, TextInput, View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Stop, Path, Circle, Ellipse, G, Polygon, Rect } from 'react-native-svg';
import { QuizStep } from '../../domain/quizDefinition';
import { ReferenceJourneyFrame } from '../../../../design/components/ReferenceJourneyFrame';
import { BrandHeading, BodyText } from '../../../../design/components/Text';
import { PrimaryButton } from '../../../../design/components/PrimaryButton';
import { PressableScale } from '../../../../design/motion/PressableScale';
import { color } from '../../../../design/tokens/colors';
import { radius, spacing, touchTarget } from '../../../../design/tokens/spacing';

const REFERENCE_STEP_IDS = new Set(['welcome', 'gender', 'pronoun', 'city', 'age', 'social_verification', 'ready']);

/** Disco backdrop geometry — declared up here because `styles` (evaluated at
 *  module load) sizes the backdrop box off DISCO_H. See DiscoBackground. */
const DISCO_H = 420;
const BALL_X = 195;
const BALL_Y = 118; // low enough that the whole ball clears the status bar
const BALL_R = 58;

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
          {/* Scales down for longer names instead of wrapping to a second
              line or clipping the script face's tall ascenders. numberOfLines
              +adjustsFontSizeToFit keeps it on ONE line on the platforms that
              honour it; the size ramp below guarantees a sane result
              everywhere else (Android ignores it for custom fonts). */}
          <BrandHeading
            tone="onMaroon"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.5}
            style={{ ...styles.name, ...welcomeNameSize(name) }}
          >
            {name}
          </BrandHeading>
          <Image source={require('../../../../../Public/Assets/dudes 2.png')} style={styles.welcomeArt} resizeMode="contain" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
          <BrandHeading tone="onMaroon" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={styles.welcomeTag}>lets find your frinq</BrandHeading>
          <Arrow tone="cream" label="Continue" onPress={onContinue} />
        </View>
      </ReferenceJourneyFrame>
    );
  }

  if (step.id === 'ready') {
    return (
      <ReferenceJourneyFrame tone="maroon" onBack={onBack} backdrop={<DiscoBackground />}>
        <View style={styles.readyBody}>
          <View style={styles.readyArt}>
            <Image source={require('../../../../../Public/Assets/dudes 3.png')} style={styles.fillArt} resizeMode="contain" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
          </View>
          <BrandHeading tone="onMaroon" numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.55} style={styles.readyHeading}>now let's figure out{`\n`}your vibe</BrandHeading>
          <BodyText tone="onMaroon" style={styles.readyCopy}>so. are you ready?</BodyText>
          <PrimaryButton label="Hell yeah! 🔥" variant="secondary" onPress={onContinue} style={styles.readyCta} />
        </View>
      </ReferenceJourneyFrame>
    );
  }

  if (step.id === 'gender' && step.kind === 'singleChoiceList') {
    return (
      <ReferenceJourneyFrame
        onBack={onBack}
        scroll
        footer={<><Arrow label="Continue identity" onPress={onContinue} disabled={!value} /><View style={styles.skipSpacer} /></>}
      >
        <View style={styles.creamBody}>
          <PageHeading text={heading} />
          <View style={styles.options}>
            {step.options.map((option) => <Choice key={option.value} label={option.label} selected={value === option.value} onPress={() => onAnswer(option.value)} />)}
          </View>
        </View>
      </ReferenceJourneyFrame>
    );
  }

  if (step.id === 'pronoun') {
    return (
      <ReferenceJourneyFrame
        onBack={onBack}
        scroll
        footer={<><Arrow label="Continue pronouns" onPress={onContinue} /><View style={styles.skipSpacer} /></>}
      >
        <View style={styles.creamBody}>
          <PageHeading text={heading} />
          <TextInput accessibilityLabel="Your pronouns" placeholder="She/her, he/him, they/them" placeholderTextColor={color.text.muted} value={(value as string) ?? ''} onChangeText={onAnswer} style={[styles.underlineInput, { marginTop: 120 }]} />
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
        footer={<><Arrow label="Continue city" onPress={onContinue} disabled={typeof value !== 'string' || value.trim().length < 2} /><View style={styles.skipSpacer} /></>}
      >
        <View style={styles.creamBody}>
          <PageHeading text={heading} />
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
    /** Typing a single digit ("4") means the 4th — pad it to "04" once the
     *  field is left, so nobody has to type the leading zero themselves. Only
     *  on blur: padding mid-typing would fight someone entering "1" then "2". */
    const padOnBlur = (raw: string, apply: (padded: string) => void) => () => {
      if (raw.length === 1) apply(`0${raw}`);
    };
    return (
      <ReferenceJourneyFrame
        onBack={onBack}
        scroll
        footer={<><Arrow label="Continue birthday" onPress={onContinue} disabled={!day || !month || !year || year.length < 4} /><View style={styles.skipSpacer} /></>}
      >
        <View style={styles.creamBody}>
          <PageHeading text={heading} />
          <View style={{ marginTop: 60, alignItems: 'center', gap: 24 }}>
            <View style={{ alignItems: 'center' }}>
              <TextInput accessibilityLabel="Day" keyboardType="number-pad" maxLength={2} value={day} onChangeText={(d) => updateDate(d, month, year)} onBlur={padOnBlur(day, (p) => updateDate(p, month, year))} style={styles.birthdayInput} />
              <BodyText tone="secondary" style={styles.birthdayLabel}>day</BodyText>
            </View>
            <View style={{ alignItems: 'center' }}>
              <TextInput accessibilityLabel="Month" keyboardType="number-pad" maxLength={2} value={month} onChangeText={(m) => updateDate(day, m, year)} onBlur={padOnBlur(month, (p) => updateDate(day, p, year))} style={styles.birthdayInput} />
              <BodyText tone="secondary" style={styles.birthdayLabel}>month</BodyText>
            </View>
            <View style={{ alignItems: 'center' }}>
              <TextInput accessibilityLabel="Year" keyboardType="number-pad" maxLength={4} value={year} onChangeText={(y) => updateDate(day, month, y)} style={styles.birthdayInput} />
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
          <PageHeading text={heading} />
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

/** Every cream onboarding page's Borel heading. numberOfLines is pinned to the
 *  AUTHORED line count and the font auto-shrinks to fit, so a line that's too
 *  wide for the column ("identify yourself", "social verification") shrinks
 *  instead of wrapping onto an extra line the container never lays out — which
 *  is what was clipping the last word. */
function PageHeading({ text }: { text: string }) {
  return (
    <BrandHeading
      testID="reference-onboarding-heading"
      tone="brand"
      numberOfLines={text.split('\n').length}
      adjustsFontSizeToFit
      minimumFontScale={0.6}
      style={styles.heading}
    >
      {text}
    </BrandHeading>
  );
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

/** Font ramp for the welcome name. The name is capped at 16 characters
 *  (NameScreen's own rule), so these three tiers cover the whole range —
 *  lineHeight scales with the size to keep the script face's ascenders and
 *  descenders inside the line box rather than clipped at the top. */
function welcomeNameSize(name: string): { fontSize: number; lineHeight: number } {
  // Borel's ascenders (the 'h'/'k'/'l' loops) overshoot a normal line box, so
  // lineHeight runs ~1.6x the size and the style below adds top padding —
  // at 48/68 the tops were still being clipped.
  if (name.length <= 8) return { fontSize: 40, lineHeight: 64 };
  if (name.length <= 12) return { fontSize: 32, lineHeight: 54 };
  return { fontSize: 26, lineHeight: 46 };
}

const styles = StyleSheet.create({
  maroonBody: { flex: 1, alignItems: 'center', paddingTop: 88, paddingBottom: spacing.xl },
  welcome: { alignSelf: 'flex-start', fontSize: 30, lineHeight: 42 },
  name: { alignSelf: 'flex-start', width: '100%', paddingTop: 12 },
  welcomeArt: { width: '100%', height: 330, flex: 1, marginTop: spacing.xl },
  // Sized to clear "lets find your frinq" on ONE line (36 wrapped to two) and
  // centred rather than inheriting the left-aligned column above it.
  welcomeTag: { fontSize: 26, lineHeight: 44, width: '100%', textAlign: 'center', alignSelf: 'center', marginBottom: spacing.xl },
  readyBody: { flex: 1, alignItems: 'center', paddingTop: 168, paddingBottom: spacing.xl },
  // Explicit box, not `aspectRatio` on the Image itself: with only a width and
  // an aspectRatio, the Image kept its INTRINSIC 702x403 height and just had
  // its width clamped by the parent, so it rendered 411x403 and cropped the
  // crowd. A sized wrapper + a 100%/100% child leaves nothing to infer.
  // 205dp ≈ the reference's crowd height at 702:403.
  readyArt: { width: '100%', height: 205 },
  fillArt: { width: '100%', height: '100%' },
  // Auto-shrinks within two lines: Borel at a fixed 40 wrapped "figure out"
  // onto its own third line on a 390dp screen.
  readyHeading: { fontSize: 36, textAlign: 'center', width: '100%', marginTop: 'auto' },
  readyCopy: { fontSize: 20, lineHeight: 28, marginTop: spacing.xxl },
  readyCta: { alignSelf: 'stretch', marginTop: 'auto' },
  disco: { width: '100%', height: DISCO_H },
  // Raised from 130: pushes the heading block up so a 2-3 line script
  // heading has room to breathe instead of crowding what follows it.
  creamBody: { flex: 1, alignItems: 'center', paddingTop: 104, paddingBottom: spacing.xl },
  // Borel's descenders (the 'y' loops in "identify") drop well below the
  // baseline, so a 1.5x lineHeight clipped them. 1.7x + bottom padding gives
  // the tails room; the wider maxWidth stops "yourself" being forced onto a
  // cramped extra line.
  // These headings carry their OWN line breaks ("how do you\nidentify
  // yourself"), so they're authored as 2 lines. maxWidth 320 minus the 16
  // side padding left only 288px — too narrow for "identify yourself", which
  // wrapped to an unintended 3rd line that Android then clipped. Widening to
  // fit the authored break is the actual fix; the earlier lineHeight/padding
  // bumps treated the symptom. No explicit lineHeight: Borel's natural
  // metrics already reserve room for its deep descenders, and overriding
  // them is what crops the tails.
  // Sized so the LONGEST authored line ("identify yourself") fits on one
  // line in the available column. At 28 it overflowed and wrapped to a third
  // line which then didn't lay out at all — the word simply vanished.
  // width:'100%' uses the full column instead of shrink-to-fit, and no
  // explicit lineHeight so Borel's own metrics reserve its descender room.
  heading: { fontSize: 24, textAlign: 'center', width: '100%', paddingHorizontal: 4, paddingBottom: 20 },
  // alignItems centres the 55%-wide pills; without it they hugged the left.
  options: { width: '100%', marginTop: spacing.xxxl, gap: 24, paddingHorizontal: 40, alignItems: 'center' },
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
  // Every onboarding screen now renders this in the frame's fixed footer
  // slot, so it lands at the SAME y on all of them. The old `marginTop:'auto'`
  // only worked for the two screens that put it inside the scrolling body,
  // which is exactly why the arrow drifted between pages.
  arrow: { minHeight: touchTarget.preferred + 8, justifyContent: 'center', alignItems: 'center', alignSelf: 'center' },
  arrowImage: { width: 130, height: 48 },
  disabled: { opacity: 0.4 },
  // alignSelf/alignItems both needed: the footer slot stretches its children,
  // so without them the tap target spanned the full width and the label sat
  // hard left instead of centred under the arrow.
  skip: { minHeight: touchTarget.min, marginTop: 4, justifyContent: 'center', alignItems: 'center', alignSelf: 'center' },
  // Occupies exactly the skip row's footprint on the screens that have no
  // skip, so the arrow sits at the SAME height on every onboarding page
  // instead of dropping lower wherever the skip is absent.
  skipSpacer: { minHeight: touchTarget.min, marginTop: 4 },
});

/** Disco backdrop for the 'ready' screen (reference 15). Rendered through
 *  ReferenceJourneyFrame's `backdrop` slot so it bleeds to all four physical
 *  edges — the previous version lived inside the padded content column and
 *  left blank strips down both sides and above the status bar.
 *
 *  `preserveAspectRatio="none"` on a viewBox that already matches the box's
 *  own ratio-ish shape: any residual stretch lands on a gradient and straight
 *  wedges, which read the same stretched, and it's the only way to guarantee
 *  no letterbox gap on an arbitrary device aspect. The ball is drawn last with
 *  circles sized off the SAME viewBox, so it distorts with the rest instead of
 *  floating off-centre. */
function DiscoBackground() {
  return (
    <View style={styles.disco}>
      <Svg width="100%" height="100%" viewBox={`0 0 390 ${DISCO_H}`} preserveAspectRatio="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Defs>
          {/* magenta on the left, amber on the right — the mockup's stage wash */}
          <LinearGradient id="wash" x1="0" y1="0" x2="390" y2="60" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#FF12B8" />
            <Stop offset="0.45" stopColor="#FF3D7F" />
            <Stop offset="1" stopColor="#FFA51F" />
          </LinearGradient>
          {/* fades the wash into the page's maroon before the copy starts, so
              there is no hard seam anywhere on screen */}
          <LinearGradient id="fade" x1="0" y1="0" x2="0" y2={DISCO_H} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={color.bg.milestone} stopOpacity={0} />
            <Stop offset="0.42" stopColor={color.bg.milestone} stopOpacity={0.45} />
            <Stop offset="0.72" stopColor={color.bg.milestone} stopOpacity={0.94} />
            <Stop offset="1" stopColor={color.bg.milestone} stopOpacity={1} />
          </LinearGradient>
          <RadialGradient id="halo" cx={BALL_X} cy={BALL_Y} r={BALL_R * 2.6} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.55} />
            <Stop offset="0.5" stopColor="#FF8AD8" stopOpacity={0.22} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>
        </Defs>

        <Rect x="0" y="0" width="390" height={DISCO_H} fill="url(#wash)" />

        {/* Light beams: broad wedges from the ball, not hairlines. Skipping the
            two that point straight up keeps the top corners clean like the
            reference. */}
        <G fill="#FFFFFF" opacity={0.17}>
          {[-72, -36, 0, 22, 55, 90, 125, 158, 180, 202, 235].map((deg) => {
            const half = 7 * Math.PI / 180;
            const a = (deg - 90) * Math.PI / 180;
            const L = 760;
            return (
              <Polygon
                key={deg}
                points={[
                  `${BALL_X},${BALL_Y}`,
                  `${BALL_X + Math.cos(a - half) * L},${BALL_Y + Math.sin(a - half) * L}`,
                  `${BALL_X + Math.cos(a + half) * L},${BALL_Y + Math.sin(a + half) * L}`,
                ].join(' ')}
              />
            );
          })}
        </G>

        <Rect x="0" y="0" width="390" height={DISCO_H} fill="url(#fade)" />

        {/* hanging wire, then the ball itself */}
        <Path d={`M${BALL_X},-20 Q${BALL_X + 9},${BALL_Y - 70} ${BALL_X},${BALL_Y - BALL_R}`} stroke="#FFFFFF" strokeWidth={1.2} fill="none" />
        <Circle cx={BALL_X} cy={BALL_Y} r={BALL_R * 2.4} fill="url(#halo)" />
        <G stroke="#FFFFFF" strokeWidth={1.3} fill="none">
          <Circle cx={BALL_X} cy={BALL_Y} r={BALL_R} />
          {[0.32, 0.62, 0.86].map((k) => (
            <Ellipse key={`v${k}`} cx={BALL_X} cy={BALL_Y} rx={BALL_R * k} ry={BALL_R} />
          ))}
          {[-0.62, -0.3, 0, 0.3, 0.62].map((k) => (
            <Ellipse key={`h${k}`} cx={BALL_X} cy={BALL_Y + BALL_R * k} rx={Math.sqrt(1 - k * k) * BALL_R} ry={BALL_R * 0.16} />
          ))}
        </G>
        <G fill="#FFFFFF">
          {[[BALL_X - 46, BALL_Y - 40], [BALL_X + 52, BALL_Y + 30], [BALL_X + 30, BALL_Y - 58]].map(([sx, sy]) => (
            <Path key={`${sx}-${sy}`} d={`M${sx},${sy - 11} Q${sx + 2},${sy - 2} ${sx + 11},${sy} Q${sx + 2},${sy + 2} ${sx},${sy + 11} Q${sx - 2},${sy + 2} ${sx - 11},${sy} Q${sx - 2},${sy - 2} ${sx},${sy - 11} Z`} />
          ))}
        </G>
      </Svg>
    </View>
  );
}
