import React from 'react';
import { StyleSheet, View } from 'react-native';
import { PrimaryButton } from '../../../design/components/PrimaryButton';
import { BodyText } from '../../../design/components/Text';
import { PressableScale } from '../../../design/motion/PressableScale';
import { color } from '../../../design/tokens/colors';
import { radius, spacing, touchTarget } from '../../../design/tokens/spacing';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  secondaryLabel?: string;
  onSecondaryPress?: () => void;
};

/** Bottom-anchored CTA for the pre-auth reference journey (Landing → OTP).
 *  Geometry matches Figma node 163:1050 ("location services", the button
 *  placement source of truth for every screen in this flow): 76%-wide,
 *  48pt-tall, radius-md button, flush to the frame's bottom padding via
 *  marginTop:'auto'. When a screen has no secondary link, `actionsReserve`
 *  blanks out the same slot a link would occupy, so the button itself sits
 *  at the same height whether or not a link follows it. */
export function ReferenceCtaFooter({ label, onPress, disabled, busy, secondaryLabel, onSecondaryPress }: Props) {
  return (
    <View testID="reference-cta-actions" style={[styles.actions, !secondaryLabel && styles.actionsReserve]}>
      <PrimaryButton label={label} onPress={onPress} disabled={disabled} busy={busy} style={styles.cta} />
      {!!secondaryLabel && !!onSecondaryPress && (
        <PressableScale accessibilityRole="button" accessibilityLabel={secondaryLabel} onPress={onSecondaryPress} haptic={false} style={styles.secondary}>
          <BodyText style={styles.secondaryText}>{secondaryLabel}</BodyText>
        </PressableScale>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { width: '100%', alignItems: 'center', marginTop: 'auto' },
  actionsReserve: { paddingBottom: touchTarget.min + spacing.lg },
  cta: { width: '76%', minHeight: touchTarget.preferred, borderRadius: radius.md },
  secondary: { minHeight: touchTarget.min, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  secondaryText: { color: color.brand.maroon, fontSize: 18, lineHeight: 24 },
});
