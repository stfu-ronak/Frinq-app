import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { color } from '../tokens/colors';
import { radius, spacing } from '../tokens/spacing';
import { BodyText, BrandHeading } from './Text';
import { PrimaryButton } from './PrimaryButton';

type Action = { label: string; onPress: () => void };

type Props = {
  visible: boolean;
  title: string;
  message?: string;
  confirm: Action;
  cancel?: Action;
  /** Style the confirm as destructive (still maroon, labelled clearly). */
  onRequestClose?: () => void;
  children?: React.ReactNode;
};

/** Centered modal dialog. Backdrop press invokes cancel/close; the dialog is
 *  an accessible modal region with a header. */
export function Dialog({ visible, title, message, confirm, cancel, onRequestClose, children }: Props) {
  const close = onRequestClose ?? cancel?.onPress;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close} accessibilityViewIsModal>
      <Pressable style={styles.scrim} onPress={close} accessibilityElementsHidden={false}>
        <Pressable style={styles.card} onPress={() => {}} accessibilityViewIsModal accessibilityRole="alert">
          <BrandHeading variant="heading">{title}</BrandHeading>
          {!!message && (
            <BodyText variant="body" tone="secondary" style={styles.message}>
              {message}
            </BodyText>
          )}
          {children}
          <View style={styles.actions}>
            {cancel && <PrimaryButton label={cancel.label} onPress={cancel.onPress} variant="secondary" style={styles.action} />}
            <PrimaryButton label={confirm.label} onPress={confirm.onPress} style={styles.action} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: color.bg.scrim, justifyContent: 'center', paddingHorizontal: spacing.xl },
  card: { backgroundColor: color.brand.cream, borderRadius: radius.lg, padding: spacing.xl },
  message: { marginTop: spacing.sm },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: spacing.xl },
  action: { marginLeft: spacing.sm },
});
