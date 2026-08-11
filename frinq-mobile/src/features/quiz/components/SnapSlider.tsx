import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { color } from '../../../design/tokens/colors';
import { radius, spacing, touchTarget } from '../../../design/tokens/spacing';
import { BodyText, BrandHeading } from '../../../design/components/Text';
import { PressableScale } from '../../../design/motion/PressableScale';
import { useReducedMotion } from '../../../design/motion/useReducedMotion';

const SNAP_LABELS = ['strongly left', 'left', 'middle', 'right', 'strongly right'];
const SNAP_VALUES = [0, 25, 50, 75, 100] as const;

type Props = {
  prompt: string;
  leftLabel: string;
  leftHint: string;
  rightLabel: string;
  rightHint: string;
  /** One of 0/25/50/75/100, or undefined if unanswered. */
  value: number | undefined;
  onChange: (value: number) => void;
};

/**
 * Discrete 5-stop selector (0/25/50/75/100), tap-based rather than a
 * continuous drag gesture. Data-equivalent to the web reference's snap-to-5
 * slider (every value it can produce is one of these five); a true
 * drag-and-snap gesture is a motion-polish upgrade, not a correctness gap,
 * and can replace this without changing the answer shape.
 */
/** "not me" / "that's so me!" is a fixed convention for this component (per
 *  the Figma design), not sourced from leftLabel/rightLabel — those two
 *  props are directional-comparison labels ("what you see" vs "what you
 *  sense") that don't fit a single self-descriptive statement's scale. */
const SCALE_LOW = 'not me';
const SCALE_HIGH = "that's so me!";

export function SnapSlider({ prompt, value, onChange }: Props) {
  const selectedIndex = value === undefined ? -1 : SNAP_VALUES.indexOf(value as (typeof SNAP_VALUES)[number]);

  return (
    <View style={styles.wrap}>
      {/* Fixed-height slot: the statement starts at the top of the page like
          every other question's heading, and — because the slot's height never
          changes — a 2-line statement and a 3-line one leave the slider at the
          exact same Y. */}
      <View testID="snap-slider-prompt-slot" style={styles.promptSlot}>
        <BrandHeading variant="heading" tone="brand" numberOfLines={PROMPT_LINES} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.prompt}>
          {prompt}
        </BrandHeading>
      </View>
      <View style={styles.sliderSlot}>
        <View style={styles.track} accessibilityRole="adjustable" accessibilityLabel={prompt} accessibilityValue={{ min: 0, max: 100, now: value ?? 50 }}>
          {SNAP_VALUES.map((snapValue, i) => (
            <PressableScale
              key={snapValue}
              accessibilityRole="button"
              accessibilityLabel={SNAP_LABELS[i]}
              accessibilityState={{ selected: i === selectedIndex }}
              onPress={() => onChange(snapValue)}
              style={styles.dotTarget}
            >
              <SnapDot selected={i === selectedIndex} />
            </PressableScale>
          ))}
        </View>
        <View style={styles.hintRow}>
          <BodyText variant="caption" tone="secondary">{SCALE_LOW}</BodyText>
          <BodyText variant="caption" tone="secondary">{SCALE_HIGH}</BodyText>
        </View>
      </View>
    </View>
  );
}

/** Grows/darkens into the selected state instead of snapping between two
 *  static sizes — the "smooth pick" the design calls for. */
function SnapDot({ selected }: { selected: boolean }) {
  const reduced = useReducedMotion();
  const t = useSharedValue(selected ? 1 : 0);

  useEffect(() => {
    const to = selected ? 1 : 0;
    t.value = reduced ? to : withTiming(to, { duration: 180 });
  }, [selected, reduced, t]);

  const animated = useAnimatedStyle(() => {
    const size = DOT_IDLE + (DOT_SELECTED - DOT_IDLE) * t.value;
    return {
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: interpolateColor(t.value, [0, 1], [color.brand.peachDeep, color.state.selected]),
    };
  });

  return <Animated.View style={animated} />;
}

const DOT_IDLE = 12;
const DOT_SELECTED = 34;

const PROMPT_LINES = 3;
const PROMPT_LINE_H = 34;
/** + BrandHeading's own 8/4 padding. */
const PROMPT_SLOT_H = PROMPT_LINES * PROMPT_LINE_H + 12;

const styles = StyleSheet.create({
  wrap: { flex: 1, marginBottom: spacing.xl },
  promptSlot: { height: PROMPT_SLOT_H, width: '100%', justifyContent: 'flex-start' },
  sliderSlot: { flex: 1, justifyContent: 'center' },
  // Vastago, not the cursive display face — these are full self-descriptive
  // sentences, and the reference sets them in the same rounded sans as body
  // copy, just larger.
  prompt: { fontSize: 24, lineHeight: PROMPT_LINE_H, textAlign: 'center' },
  track: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: color.border.waveTrack, borderRadius: radius.pill,
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs,
  },
  dotTarget: { width: touchTarget.min, height: touchTarget.min, alignItems: 'center', justifyContent: 'center' },
  hintRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md },
});
