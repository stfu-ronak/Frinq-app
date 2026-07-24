import React from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { Screen } from '../../../design/components/Screen';
import { BodyText, BrandHeading } from '../../../design/components/Text';
import { spacing } from '../../../design/tokens/spacing';
import { color } from '../../../design/tokens/colors';
import { useAnalyticsConsent } from '../../../app/AppProviders';

/** Pure client-side toggle, no backend call — matches the web reference
 *  exactly. Off by default; never gates on phone/messages/quiz answers. */
export function PrivacySettingsScreen() {
  const { enabled, setEnabled } = useAnalyticsConsent();

  return (
    <Screen>
      <BrandHeading variant="title" style={styles.title}>
        privacy
      </BrandHeading>
      <BodyText variant="caption" tone="secondary" style={styles.hint}>
        anonymous usage analytics (screen views, quiz progress, chat activity) help us fix bugs
        and improve frinq. off by default — never your phone, messages, or quiz answers.
      </BodyText>

      <View style={styles.row}>
        <BodyText variant="body" style={styles.label}>
          share anonymous usage analytics
        </BodyText>
        <Switch
          value={enabled}
          onValueChange={setEnabled}
          trackColor={{ false: color.border.subtle, true: color.state.selected }}
          thumbColor={color.brand.cream}
          accessibilityLabel="share anonymous usage analytics"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.lg },
  hint: { marginBottom: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: color.border.subtle,
  },
  label: { flex: 1, marginRight: spacing.md },
});
