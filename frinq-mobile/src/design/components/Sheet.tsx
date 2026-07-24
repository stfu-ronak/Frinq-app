import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { color } from '../tokens/colors';
import { radius, spacing } from '../tokens/spacing';
import { BrandHeading } from './Text';

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
};

/** Bottom sheet. Backdrop press closes; content sits in a rounded top panel
 *  above the safe area. Accessible modal region. */
export function Sheet({ visible, onClose, title, children }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} accessibilityViewIsModal>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.panelWrap} onPress={() => {}}>
          <SafeAreaView edges={['bottom']} style={styles.panel}>
            <View style={styles.grabber} accessibilityElementsHidden importantForAccessibility="no" />
            {!!title && <BrandHeading variant="heading" style={styles.title}>{title}</BrandHeading>}
            {children}
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: color.bg.scrim, justifyContent: 'flex-end' },
  panelWrap: { width: '100%' },
  panel: { backgroundColor: color.brand.cream, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.lg },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: radius.pill, backgroundColor: color.border.subtle, marginBottom: spacing.lg },
  title: { marginBottom: spacing.md },
});
