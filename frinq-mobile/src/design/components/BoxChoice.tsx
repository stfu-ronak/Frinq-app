import React from 'react';
import { StyleSheet } from 'react-native';
import { color } from '../tokens/colors';
import { radius, spacing } from '../tokens/spacing';
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
      <BodyText variant="heading">{label}</BodyText>
    </PressableScale>
  );
}

/** The "or" divider between two stacked BoxChoice options. */
export function BoxChoiceDivider() {
  return (
    <BodyText variant="bodyStrong" style={styles.orDivider}>
      or
    </BodyText>
  );
}

const styles = StyleSheet.create({
  box: {
    minHeight: 110,
    borderWidth: 1,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  orDivider: { alignSelf: 'center' },
});
