import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, Switch, View } from 'react-native';
import { Screen } from '../../../design/components/Screen';
import { BodyText, BrandHeading } from '../../../design/components/Text';
import { PrimaryButton } from '../../../design/components/PrimaryButton';
import { spacing } from '../../../design/tokens/spacing';
import { color } from '../../../design/tokens/colors';
import { useSession } from '../../../services/session/sessionContext';
import {
  PushPermissionStatus,
  getPushPermissionStatus,
  getStoredPushEnabled,
  registerCurrentToken,
  requestPushPermission,
  setPushEnabled,
} from '../../../services/push/pushService';

/** Device-level push settings. The master toggle maps to push_tokens.enabled
 *  (mutes push without touching OS permission or the registered token) —
 *  distinct from OS permission, which this screen can request but never
 *  revoke (only the device's own settings can do that). */
export function NotificationSettingsScreen() {
  const { apiClient } = useSession();
  const [status, setStatus] = useState<PushPermissionStatus | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const [s, e] = await Promise.all([getPushPermissionStatus(), getStoredPushEnabled()]);
      setStatus(s);
      setEnabled(e);
    })();
  }, []);

  async function handleToggle(next: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      let currentStatus = status;
      if (next && currentStatus === 'not-determined') {
        await requestPushPermission();
        currentStatus = await getPushPermissionStatus();
        setStatus(currentStatus);
      }
      if (next && currentStatus !== 'authorized' && currentStatus !== 'provisional') {
        return; // permission refused — toggle stays off, no preferences call
      }
      if (next) await registerCurrentToken(apiClient);
      await setPushEnabled(apiClient, next);
      setEnabled(next);
    } catch {
      setError("couldn't save, try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <BrandHeading variant="title" style={styles.title}>
        notifications
      </BrandHeading>
      <BodyText variant="caption" tone="secondary" style={styles.hint}>
        get notified about new activity in your frinq squad.
      </BodyText>

      {status === null ? (
        <BodyText variant="body" tone="secondary">
          loading…
        </BodyText>
      ) : status === 'denied' ? (
        <>
          <BodyText variant="body" tone="secondary" style={styles.hint}>
            notifications are turned off for frinq in your device settings.
          </BodyText>
          <PrimaryButton label="open device settings" onPress={() => Linking.openSettings()} style={styles.action} />
        </>
      ) : (
        <View style={styles.row}>
          <BodyText variant="body" style={styles.label}>
            notify me about new activity
          </BodyText>
          <Switch
            value={enabled}
            onValueChange={handleToggle}
            disabled={busy}
            trackColor={{ false: color.border.subtle, true: color.state.selected }}
            thumbColor={color.brand.cream}
            accessibilityLabel="notify me about new activity"
          />
        </View>
      )}

      {!!error && (
        <BodyText variant="caption" tone="error" accessibilityRole="alert" style={styles.hint}>
          {error}
        </BodyText>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.lg },
  hint: { marginBottom: spacing.lg },
  action: { alignSelf: 'flex-start' },
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
