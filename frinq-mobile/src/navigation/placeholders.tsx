import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Screen } from '../design/components/Screen';
import { BrandHeading, BodyText } from '../design/components/Text';
import { color } from '../design/tokens/colors';

/** Temporary labelled placeholder used by the Phase 7 navigation scaffold.
 *  Real feature screens replace these in Phases 8-10. */
export function Placeholder({ title, note, testID }: { title: string; note?: string; testID?: string }) {
  return (
    <Screen>
      <View style={styles.center} testID={testID}>
        <BrandHeading variant="title">{title}</BrandHeading>
        {!!note && (
          <BodyText variant="body" tone="secondary" style={styles.note}>
            {note}
          </BodyText>
        )}
      </View>
    </Screen>
  );
}

/** Boot splash shown only while BootState === 'checking'. No protected content. */
export function BootSplash() {
  return (
    <View style={styles.splash} testID="boot-splash">
      <View style={styles.dot} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  note: { textAlign: 'center', marginTop: 8 },
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.bg.canvas },
  dot: { width: 10, height: 10, borderRadius: 999, backgroundColor: color.state.selected },
});
