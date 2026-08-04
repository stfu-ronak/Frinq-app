import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { color } from '../tokens/colors';
import { radius, spacing } from '../tokens/spacing';
import { BodyText } from './Text';
import { PressableScale } from '../motion/PressableScale';

export type IconChoiceGlyph = 'bookmark' | 'beer' | 'drink' | 'book' | 'travel' | 'party' | 'dot';

const GLYPHS: Record<IconChoiceGlyph, React.ReactElement> = {
  bookmark: (
    <Path d="M6 3.5h12v17l-6-4.2-6 4.2v-17Z" stroke={color.brand.maroon} strokeWidth={1.4} fill="none" strokeLinejoin="round" />
  ),
  beer: (
    <>
      <Path d="M6 8h9v11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8Z" stroke={color.brand.maroon} strokeWidth={1.4} fill="none" />
      <Path d="M15 10h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2" stroke={color.brand.maroon} strokeWidth={1.4} fill="none" />
      <Path d="M8 5.5c0-1 .8-2 .8-3M11.5 5.5c0-1.2 1-2 1-3.2" stroke={color.brand.maroon} strokeWidth={1.2} fill="none" strokeLinecap="round" />
    </>
  ),
  drink: (
    <>
      <Path d="M5 5h14l-6.2 8v6" stroke={color.brand.maroon} strokeWidth={1.4} fill="none" strokeLinejoin="round" />
      <Path d="M9.5 21h5" stroke={color.brand.maroon} strokeWidth={1.4} strokeLinecap="round" />
    </>
  ),
  book: (
    <Path d="M4 5.5c2.2-1 5-1 8 .5v13c-3-1.5-5.8-1.5-8-.5V5.5ZM20 5.5c-2.2-1-5-1-8 .5v13c3-1.5 5.8-1.5 8-.5V5.5Z" stroke={color.brand.maroon} strokeWidth={1.3} fill="none" strokeLinejoin="round" />
  ),
  travel: (
    <>
      <Rect x={5} y={8} width={14} height={11} rx={2} stroke={color.brand.maroon} strokeWidth={1.4} fill="none" />
      <Path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" stroke={color.brand.maroon} strokeWidth={1.4} fill="none" />
    </>
  ),
  party: (
    <>
      <Path d="M4.5 19.5 13 6l5 5-9.5 8.5-4.7 1.2 1.2-4.7Z" stroke={color.brand.maroon} strokeWidth={1.3} fill="none" strokeLinejoin="round" />
      <Circle cx={17.5} cy={4.5} r={0.9} fill={color.brand.maroon} />
      <Circle cx={20} cy={8} r={0.9} fill={color.brand.maroon} />
      <Circle cx={20} cy={3.5} r={0.7} fill={color.brand.maroon} />
    </>
  ),
  dot: <Circle cx={12} cy={12} r={3} fill={color.brand.maroon} />,
};

/** Icon + label + radio-circle row for the "who you are" MCQ list layout
 *  (Figma "chilling options" list, e.g. "what do you do for chilling?") —
 *  no box border, a bottom hairline divider instead. Distinct from the
 *  shared ChoiceListRow (bordered box + checkmark), which ReportSheet and
 *  other non-quiz consumers still use unchanged. */
export function IconChoiceRow({
  label, selected, onPress, glyph = 'dot', disabled = false, style,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  glyph?: IconChoiceGlyph;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  return (
    <PressableScale
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      haptic={!disabled}
      style={[styles.row, style]}
    >
      <View style={styles.iconWrap}>
        <Svg width={20} height={20} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no">
          {GLYPHS[glyph]}
        </Svg>
      </View>
      <BodyText variant="body" tone={disabled ? 'disabled' : 'primary'} style={styles.label}>
        {label}
      </BodyText>
      <View style={[styles.radio, selected && styles.radioSelected]} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 75,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: color.border.subtle,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(217,217,217,0.29)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { flex: 1 },
  radio: { width: 20, height: 20, borderRadius: radius.pill, borderWidth: 1, borderColor: color.border.subtle },
  radioSelected: { borderColor: color.brand.maroon, backgroundColor: color.brand.maroon },
});
