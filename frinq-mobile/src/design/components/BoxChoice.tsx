import React from 'react';
import { StyleSheet } from 'react-native';
import { color } from '../tokens/colors';
import { radius, spacing } from '../tokens/spacing';
import { fontFamily } from '../tokens/typography';
import { BodyText } from './Text';
import { PressableScale } from '../motion/PressableScale';

type Props = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

/** Large bordered box option — Figma's "would you rather" A/B choice
 *  ("Go out on sunday" / "Sleep at home"). Selected fills a peach surface. */
export function BoxChoice({ label, selected, onPress }: Props) {
  return (
    <PressableScale
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.box, { borderColor: color.border.default, backgroundColor: selected ? color.bg.surface : 'transparent' }]}
    >
      <BodyText variant="subheading" style={styles.label}>{label}</BodyText>
    </PressableScale>
  );
}

/** The "or" divider between two stacked BoxChoice options — same cursive
 *  Borel script as the question heading above it, just smaller, not the
 *  plain body sans used for regular copy. */
export function BoxChoiceDivider() {
  return (
    <BodyText tone="brand" style={styles.orDivider}>
      or
    </BodyText>
  );
}

const styles = StyleSheet.create({
  box: {
    // Taller than the old 110: the reference gives each side of an either/or
    // real presence on the page rather than two shallow strips under the
    // question.
    minHeight: 148,
    borderWidth: 1,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  label: { textAlign: 'center' },
  orDivider: { alignSelf: 'center', fontFamily: fontFamily.display, fontSize: 26, lineHeight: 38 },
});
