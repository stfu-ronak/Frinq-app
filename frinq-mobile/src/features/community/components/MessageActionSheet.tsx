import React from 'react';
import { StyleSheet } from 'react-native';
import { spacing, touchTarget } from '../../../design/tokens/spacing';
import { color } from '../../../design/tokens/colors';
import { Sheet } from '../../../design/components/Sheet';
import { PressableScale } from '../../../design/motion/PressableScale';
import { BodyText } from '../../../design/components/Text';

type Props = {
  visible: boolean;
  onClose: () => void;
  onReport: () => void;
  onBlock: () => void;
};

/** Report/Block entry point for another user's message. */
export function MessageActionSheet({ visible, onClose, onReport, onBlock }: Props) {
  return (
    <Sheet visible={visible} onClose={onClose} title="message actions">
      <PressableScale accessibilityRole="button" onPress={onReport} style={styles.row}>
        <BodyText variant="bodyStrong" tone="primary">report</BodyText>
      </PressableScale>
      <PressableScale accessibilityRole="button" onPress={onBlock} style={styles.row}>
        <BodyText variant="bodyStrong" style={{ color: color.state.error }}>block</BodyText>
      </PressableScale>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: touchTarget.preferred, justifyContent: 'center', paddingVertical: spacing.sm },
});
