import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { color } from '../tokens/colors';
import { radius, spacing } from '../tokens/spacing';
import { BodyText, BrandHeading } from './Text';
import { PressableScale } from '../motion/PressableScale';

type Props = {
  title: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
};

/** Large rounded selectable card. Selected draws a maroon outline + peach
 *  surface; a11y selected/disabled state is explicit. */
export function ChoiceCard({ title, description, selected, onPress, disabled = false, style }: Props) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={description ? `${title}. ${description}` : title}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.base,
        {
          borderColor: selected ? color.border.default : color.border.subtle,
          borderWidth: selected ? 2 : 1,
          backgroundColor: selected ? color.bg.surface : color.bg.box,
        },
        style,
      ]}
    >
      <BrandHeading variant="heading" tone={disabled ? 'disabled' : 'primary'}>{title}</BrandHeading>
      {!!description && (
        <View style={styles.desc}>
          <BodyText variant="body" tone={disabled ? 'disabled' : 'secondary'}>{description}</BodyText>
        </View>
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radius.lg, padding: spacing.xl },
  desc: { marginTop: spacing.sm },
});
