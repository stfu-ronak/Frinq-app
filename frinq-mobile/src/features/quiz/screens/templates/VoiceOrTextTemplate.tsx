import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { QuizScreenFrame } from '../../components/QuizScreenFrame';
import { TextField } from '../../../../design/components/TextField';
import { BodyText, BrandHeading } from '../../../../design/components/Text';
import { fontFamily } from '../../../../design/tokens/typography';
import { color } from '../../../../design/tokens/colors';
import { spacing } from '../../../../design/tokens/spacing';
import { VOICE_ANSWER_PLACEHOLDER, VoiceOrTextStep } from '../../domain/quizDefinition';
import { VoiceAnswer } from '../../components/VoiceAnswer';

type Props = {
  step: VoiceOrTextStep;
  submissionId: string;
  value: string;
  onChange: (v: string) => void;
  onContinue: () => void;
  onBack?: () => void;
  /** Override QuizScreenFrame's counter stepId/subIndex — used when this
   *  template renders as an inline sub-step of another domain step
   *  (Opinions' per-pair "why" follow-up) rather than its own registry
   *  entry, so the header counter still resolves against the real step. */
  stepIdOverride?: string;
  subIndex?: number;
  /** Small, muted, cursive echo of an earlier answer this follow-up is
   *  asking about — Opinions' "what makes you think that?" showing back
   *  the side just picked ("humans can't truly be replaced."), so the
   *  context isn't lost between the pick screen and this one. */
  contextLine?: string;
};

/**
 * The design spec calls out voice/story as a "dedicated feature component"
 * rather than a generic registry template — this file already was one (its
 * own file, referenced by kind from the registry, not an inline template), so
 * Task 33 enhances it in place instead of adding a redundant StoryScreen.tsx.
 * The mic (VoiceAnswer) is additive: it uploads independently of the typed
 * answer, but a saved recording is a valid answer on its own — Continue must
 * enable for a voice-only response (no typed text), not just a typed one.
 */
export function VoiceOrTextTemplate({ step, submissionId, value, onChange, onContinue, onBack, stepIdOverride, subIndex, contextLine }: Props) {
  const [hasRecording, setHasRecording] = useState(false);
  const isPlaceholder = value === VOICE_ANSWER_PLACEHOLDER;
  const valid = value.trim().length > 0 || hasRecording;

  // A saved recording must write a real VALUE into the answers dict, not just
  // flip local state. QuizSubmissionService.finalize() requires every answer
  // key to be present and bails out WITHOUT any network call if one is
  // missing — so a voice-only answer used to leave its key absent and made
  // the entire quiz unsubmittable at the final step. The sentinel is the
  // backend's own _VOICE_PLACEHOLDER, which build_page2_input already
  // replaces with the Whisper transcript (and skips when there isn't one).
  const handleRecordingStatus = useCallback(
    (has: boolean) => {
      setHasRecording(has);
      if (has) {
        // Never clobber something the user actually typed — the typed text is
        // the better answer, and the clip is uploaded independently anyway.
        if (value.trim().length === 0) onChange(VOICE_ANSWER_PLACEHOLDER);
      } else if (value === VOICE_ANSWER_PLACEHOLDER) {
        // Recording deleted and nothing typed: drop the sentinel rather than
        // submitting a placeholder that stands for no audio at all.
        onChange('');
      }
    },
    [value, onChange],
  );
  return (
    <QuizScreenFrame
      stepId={stepIdOverride ?? step.id}
      subIndex={subIndex}
      onBack={onBack}
      headerVariant="counter"
      continueLabel="continue"
      onContinue={onContinue}
      continueDisabled={!valid}
    >
      {/* Fixed-height prompt slot. Everything below it — the mic circle above
          all — then sits at the SAME Y on every voice/text question, whether
          the prompt runs to one line or three and whether or not there's a
          context echo. Bold Vastago, not the cursive Borel display face: this
          prompt is a full sentence rather than a short MCQ question. */}
      <View style={styles.promptSlot}>
        <BrandHeading variant="heading" tone="brand" numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.heading}>
          {step.heading}
        </BrandHeading>
        {!!step.subtext && (
          <BodyText variant="body" tone="secondary" numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8} style={styles.subtext}>
            {step.subtext}
          </BodyText>
        )}
        {!!contextLine && (
          // Borel's tall ascenders/loops overflow a tight line box and get
          // clipped at the top — lineHeight well above fontSize plus explicit
          // padding gives them room instead. contextLine echoes a
          // previously-picked option of arbitrary length, so it also needs
          // adjustsFontSizeToFit — the fixed 2-line cap alone just hard-
          // truncated a long pick with no fallback.
          <BodyText tone="muted" numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.contextLine}>
            {contextLine}
          </BodyText>
        )}
      </View>
      <VoiceAnswer submissionId={submissionId} questionKey={step.answerKey} onStatusChange={handleRecordingStatus} />
      <View style={styles.divider} />
      <TextField
        label={step.heading}
        hideLabel
        // The sentinel is a storage detail, never user-facing copy — show an
        // empty box so the placeholder prompt stays visible and typing
        // replaces the sentinel rather than appending to it.
        value={isPlaceholder ? '' : value}
        onChangeText={onChange}
        placeholder={step.placeholder}
        multiline
        numberOfLines={4}
        inputStyle={styles.textBox}
        textAlignVertical="top"
      />
    </QuizScreenFrame>
  );
}

/** 3 heading lines + BrandHeading's own 8/4 padding + one line of subtext or
 *  context echo. Fixed on purpose: this is what holds the mic circle still. */
const PROMPT_SLOT_H = 3 * 36 + 12 + 34;

const styles = StyleSheet.create({
  promptSlot: { height: PROMPT_SLOT_H, width: '100%', justifyContent: 'flex-start' },
  heading: { fontSize: 28, lineHeight: 36, textAlign: 'center' },
  subtext: { textAlign: 'center' },
  contextLine: { fontFamily: fontFamily.display, fontSize: 15, lineHeight: 28, paddingTop: 6, textAlign: 'center' },
  // Separates the voice section from the typed answer below it, per the
  // reference design — otherwise the two read as one continuous block.
  divider: { height: 1, backgroundColor: color.border.subtle, marginTop: spacing.lg, marginBottom: spacing.lg },
  // A real box, not the old bottom-rule: bordered, cream, tall enough for a
  // few lines, and text starts at the TOP of it (textAlignVertical).
  textBox: { minHeight: 132, paddingTop: spacing.md, paddingBottom: spacing.md },
});
