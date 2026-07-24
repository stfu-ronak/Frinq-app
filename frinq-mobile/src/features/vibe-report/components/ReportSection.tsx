import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { BrandHeading } from '../../../design/components/Text';
import { spacing } from '../../../design/tokens/spacing';

type Props = {
  title?: string;
  children: React.ReactNode;
  style?: ViewStyle;
};

/** Generic labeled report section, reused for every content block (quote,
 *  insights, narrative, mirror/first-impression, read-notes, tags, snapshot,
 *  closing line) instead of one bespoke component per block type. */
export function ReportSection({ title, children, style }: Props) {
  return (
    <View style={[styles.section, style]}>
      {!!title && (
        <BrandHeading variant="heading" style={styles.title}>
          {title}
        </BrandHeading>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginBottom: spacing.xl, width: '100%' },
  title: { marginBottom: spacing.sm },
});
