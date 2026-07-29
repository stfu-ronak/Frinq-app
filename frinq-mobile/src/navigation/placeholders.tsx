import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
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

/** Generic transient-loading placeholder — reused across many screens
 *  (Profile/Community tab loads, quiz finalize, etc), not just app boot.
 *  Deliberately kept as a plain dot rather than the app logo: showing a full
 *  logo on every brief mid-app loading blip would read as "the app just
 *  restarted." The real cold-launch splash (with the logo) is AppLaunchSplash
 *  below, used only for RootNavigator's `checking` boot state. */
export function BootSplash() {
  return (
    <View style={styles.splash} testID="boot-splash">
      <View style={styles.dot} />
    </View>
  );
}

/** Shown only while BootState === 'checking' (true cold-launch boot resolution).
 *  Matches the native pre-JS launch background (android/.../drawable/launch_screen.xml)
 *  so the logo never disappears/reappears as the native window hands off to JS. */
export function AppLaunchSplash() {
  return (
    <View style={styles.splash} testID="app-launch-splash">
      <Image
        source={require('../assets/images/frinq-logo.png')}
        style={styles.logo}
        resizeMode="contain"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  note: { textAlign: 'center', marginTop: 8 },
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.bg.canvas },
  dot: { width: 10, height: 10, borderRadius: 999, backgroundColor: color.state.selected },
  logo: { width: 120, height: 120 },
});
