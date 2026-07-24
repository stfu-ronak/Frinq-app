import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { color } from '../tokens/colors';
import { spacing, touchTarget } from '../tokens/spacing';
import { BodyText } from './Text';
import { PressableScale } from '../motion/PressableScale';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'onMaroon';
  style?: ViewStyle;
};

/** Low-emphasis text + hand-drawn arrow affordance used across quiz continue
 *  actions. Arrow art is decorative and hidden from accessibility. */
export function ArrowButton({ label, onPress, disabled = false, tone = 'primary', style }: Props) {
  const stroke = tone === 'onMaroon' ? color.text.onMaroon : color.text.primary;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.base, style]}
    >
      <View style={styles.row}>
        <BodyText variant="overline" tone={disabled ? 'disabled' : tone === 'onMaroon' ? 'onMaroon' : 'primary'}>
          {label.toUpperCase()}
        </BodyText>
        <Svg width={22} height={9} viewBox="0 0 20 8" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.arrow}>
          <Path d="M0 4H18M18 4L14.5 1M18 4L14.5 7" stroke={disabled ? color.text.disabled : stroke} strokeWidth={1} />
        </Svg>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: touchTarget.preferred, justifyContent: 'center', alignSelf: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center' },
  arrow: { marginLeft: spacing.sm },
});
