import React from 'react';
import { StyleSheet, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { color } from '../tokens/colors';
import { spacing, touchTarget } from '../tokens/spacing';
import { BodyText } from './Text';
import { PressableScale } from '../motion/PressableScale';

type Props = {
  label: string;
  onPress: () => void;
  /** Destructive rows (e.g. Delete Account) render in error tone. */
  destructive?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};

/** Full-width navigation row with a trailing chevron and a bottom hairline —
 *  the settings/profile list-item pattern (Settings, Profile edit link). */
export function NavRow({ label, onPress, destructive = false, disabled = false, style }: Props) {
  const tone = disabled ? 'disabled' : destructive ? 'error' : 'primary';
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.row, style]}
    >
      <BodyText variant="body" tone={tone} style={styles.label}>
        {label}
      </BodyText>
      <Svg width={12} height={18} viewBox="0 0 12 18" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Path d="M1 1L9 9L1 17" stroke={disabled ? color.text.disabled : destructive ? color.state.error : color.text.secondary} strokeWidth={1.5} fill="none" />
      </Svg>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: touchTarget.preferred,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: color.border.subtle,
  },
  label: { flex: 1, marginRight: spacing.md },
});
